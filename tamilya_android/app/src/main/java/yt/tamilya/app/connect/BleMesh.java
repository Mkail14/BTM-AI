package yt.tamilya.app.connect;

import android.annotation.SuppressLint;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattServer;
import android.bluetooth.BluetoothGattServerCallback;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.AdvertiseCallback;
import android.bluetooth.le.AdvertiseData;
import android.bluetooth.le.AdvertiseSettings;
import android.bluetooth.le.BluetoothLeAdvertiser;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanFilter;
import android.bluetooth.le.ScanResult;
import android.bluetooth.le.ScanSettings;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelUuid;
import android.util.Log;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.zip.CRC32;

/**
 * Liens directs entre téléphones en Bluetooth basse consommation. Chaque téléphone s'annonce
 * (presque gratuit) et n'écoute que par courtes périodes : très souvent à l'écran, 1,5 seconde
 * par 30 à 60 secondes en arrière-plan. Celui qui écrit, à l'écran, trouve donc tout de suite
 * les téléphones autour, sans que ceux-ci dépensent leur batterie à chercher.
 * Tout se passe sur le fil principal.
 */
@SuppressLint("MissingPermission") // Permissions vérifiées par TamilyaConnect avant le démarrage.
final class BleMesh {
    interface Events {
        void onPeerUp(String peer);
        void onPeerDown(String peer);
        void onData(String peer, byte[] data);
        void onRadioProblem();
    }

    private static final String TAG = "TamilyaConnect";
    private static final UUID SERVICE = UUID.fromString("54616d69-6c79-4143-6f6e-6e6563740001");
    private static final UUID PIPE = UUID.fromString("54616d69-6c79-4143-6f6e-6e6563740002");
    private static final UUID CCCD = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    private static final int MAX_LINKS = 8;
    private static final int MIN_RSSI = -95;
    private static final int WANTED_MTU = 517;
    private static final int ATT_OVERHEAD = 3;
    private static final int HEADER = 7;
    /**
     * Taille d'un morceau, volontairement petite : Android annonce parfois une liaison plus grande
     * que la vraie, et coupe alors la fin du morceau sans rien dire. Le message reste du JSON
     * valable, mais il lui manque un bout au milieu.
     */
    private static final int MAX_PAYLOAD = 180;
    private static final int CHECK_BYTES = 8;
    private static final byte HELLO = 0;
    private static final byte DATA = 1;

    private static final long SCREEN_SCAN_MS = 8_000;
    private static final long SCREEN_PAUSE_MS = 2_000;
    private static final long BACK_SCAN_MS = 1_500;
    private static final long BACK_PAUSE_WITH_PEERS_MS = 28_500;
    private static final long BACK_PAUSE_ALONE_MS = 58_500;
    /** Après un doublon, on laisse ce téléphone tranquille un moment. */
    private static final long BACKOFF_MS = 45_000;
    /** Après une connexion ratée : on retente vite (avant, 30 s d'attente puis 45 s de pause). */
    private static final long FAILED_BACKOFF_MS = 3_000;
    /** Android attend 30 s une connexion qui ne vient pas : on abandonne bien avant. */
    private static final long CONNECT_TIMEOUT_MS = 8_000;
    /** Liaison rapide tant que des messages passent, puis retour au rythme lent. */
    private static final long FAST_IDLE_MS = 25_000;
    private static final long BUSY_RETRY_MS = 150;

    private final Context context;
    private final Events events;
    private final String self;
    private final Handler main = new Handler(Looper.getMainLooper());
    /** Par adresse Bluetooth. */
    private final Map<String, Link> links = new HashMap<>();
    private final Map<String, Long> backoff = new HashMap<>();

    private BluetoothGattServer server;
    private BluetoothGattCharacteristic serverPipe;
    private BluetoothLeAdvertiser advertiser;
    private BluetoothLeScanner scanner;
    private boolean running;
    private boolean scanning;
    private boolean onScreen = true;
    /** Connect ouvert à l'écran : recherche à pleine vitesse. Sinon (site à l'écran), recherche équilibrée. */
    private boolean eager;
    private int nextMessage;

    BleMesh(Context context, String self, Events events) {
        this.context = context;
        this.self = self;
        this.events = events;
    }

    /** Une liaison avec un voisin, dans l'un ou l'autre sens. */
    private final class Link {
        final String address;
        final BluetoothGatt gatt; // null : c'est lui qui s'est connecté à nous.
        final BluetoothDevice device;
        final ArrayDeque<byte[]> out = new ArrayDeque<>();
        /** Morceaux en attente, en nombre et en taille bornés (voir FrameAssembler). */
        final FrameAssembler incoming = new FrameAssembler(Envelopes.MAX_BYTES + CHECK_BYTES);
        BluetoothGattCharacteristic pipe;
        String peer;
        int payload = 20 - HEADER;
        boolean ready;
        boolean busy;
        boolean fast;
        final Runnable slowDown = () -> setFast(this, false);

        Link(String address, BluetoothGatt gatt, BluetoothDevice device) {
            this.address = address;
            this.gatt = gatt;
            this.device = device;
        }

        boolean weCalled() {
            return gatt != null;
        }
    }

    // --- Démarrage

    void start() {
        if (running) return;
        BluetoothManager manager = context.getSystemService(BluetoothManager.class);
        BluetoothAdapter adapter = manager == null ? null : manager.getAdapter();
        if (adapter == null || !adapter.isEnabled()) {
            Log.w(TAG, "Bluetooth coupé");
            events.onRadioProblem();
            return;
        }
        advertiser = adapter.getBluetoothLeAdvertiser();
        scanner = adapter.getBluetoothLeScanner();
        if (advertiser == null || scanner == null) {
            Log.w(TAG, "Bluetooth basse consommation indisponible");
            events.onRadioProblem();
            return;
        }
        // Android rend null si le Bluetooth s'éteint à ce moment : avant, plantage au démarrage du relais.
        if (!openServer(manager)) {
            Log.w(TAG, "Serveur Bluetooth indisponible");
            events.onRadioProblem();
            return;
        }
        running = true;
        advertise();
        scanCycle.run();
    }

    void stop() {
        if (!running) return;
        running = false;
        main.removeCallbacksAndMessages(null);
        stopScan();
        try {
            advertiser.stopAdvertising(advertising);
        } catch (RuntimeException ignored) {
            // Bluetooth coupé entre-temps.
        }
        for (Link link : new ArrayList<>(links.values())) {
            if (link.gatt != null) link.gatt.close();
            else if (server != null) server.cancelConnection(link.device);
            forget(link);
        }
        if (server != null) server.close();
        server = null;
        backoff.clear();
    }

    /**
     * Avant, l'app à l'écran cherchait à pleine vitesse 8 s sur 10, même sur le site avec internet.
     * Maintenant, pleine vitesse seulement quand Connect est ouvert ; sinon mode équilibré
     * (mêmes périodes, le téléphone relaie toujours), ce qui ménage la batterie.
     */
    void setEager(boolean value) {
        if (eager == value) return;
        eager = value;
        if (!running || !scanning) return;
        // Recherche en cours : relancée tout de suite avec la nouvelle vitesse.
        stopScan();
        startScan();
    }

    /** À l'écran : on cherche souvent. En arrière-plan : le strict minimum. */
    void setOnScreen(boolean value) {
        if (onScreen == value) return;
        onScreen = value;
        if (!running) return;
        Log.i(TAG, value ? "Écoute à l'écran" : "Écoute économe");
        // Les deux étapes du cycle : sans retirer « pause », chaque passage écran/arrière-plan
        // ajoutait un cycle de plus. Les recherches se multipliaient, Android finissait par les bloquer.
        main.removeCallbacks(scanCycle);
        main.removeCallbacks(pause);
        stopScan();
        try {
            advertiser.stopAdvertising(advertising);
            advertise();
        } catch (RuntimeException e) {
            // Bluetooth coupé à l'instant : avant, l'app plantait en quittant l'écran.
            Log.w(TAG, "Annonce non relancée : " + e.getClass().getSimpleName());
        }
        scanCycle.run();
    }

    private boolean openServer(BluetoothManager manager) {
        server = manager.openGattServer(context, serverEvents);
        if (server == null) return false;
        serverPipe = new BluetoothGattCharacteristic(PIPE,
                BluetoothGattCharacteristic.PROPERTY_WRITE | BluetoothGattCharacteristic.PROPERTY_NOTIFY,
                BluetoothGattCharacteristic.PERMISSION_WRITE);
        serverPipe.addDescriptor(new BluetoothGattDescriptor(CCCD,
                BluetoothGattDescriptor.PERMISSION_READ | BluetoothGattDescriptor.PERMISSION_WRITE));
        BluetoothGattService service = new BluetoothGattService(SERVICE, BluetoothGattService.SERVICE_TYPE_PRIMARY);
        service.addCharacteristic(serverPipe);
        server.addService(service);
        return true;
    }

    private void advertise() {
        AdvertiseSettings settings = new AdvertiseSettings.Builder()
                .setAdvertiseMode(onScreen ? AdvertiseSettings.ADVERTISE_MODE_BALANCED : AdvertiseSettings.ADVERTISE_MODE_LOW_POWER)
                .setTxPowerLevel(AdvertiseSettings.ADVERTISE_TX_POWER_MEDIUM)
                .setConnectable(true)
                .setTimeout(0)
                .build();
        // Rien sur la personne ni le téléphone : seulement le numéro du service.
        AdvertiseData data = new AdvertiseData.Builder()
                .setIncludeDeviceName(false)
                .setIncludeTxPowerLevel(false)
                .addServiceUuid(new ParcelUuid(SERVICE))
                .build();
        advertiser.startAdvertising(settings, data, advertising);
    }

    private final AdvertiseCallback advertising = new AdvertiseCallback() {
        @Override
        public void onStartSuccess(AdvertiseSettings settings) {
            Log.i(TAG, "Annonce active");
        }

        @Override
        public void onStartFailure(int code) {
            if (code == ADVERTISE_FAILED_ALREADY_STARTED) return;
            Log.w(TAG, "Annonce refusée : " + code);
            events.onRadioProblem();
        }
    };

    // --- Recherche par courtes périodes

    private final Runnable scanCycle = new Runnable() {
        @Override
        public void run() {
            if (!running) return;
            startScan();
            main.postDelayed(pause, onScreen ? SCREEN_SCAN_MS : BACK_SCAN_MS);
        }
    };

    private final Runnable pause = new Runnable() {
        @Override
        public void run() {
            stopScan();
            if (!running) return;
            long wait = onScreen ? SCREEN_PAUSE_MS : links.isEmpty() ? BACK_PAUSE_ALONE_MS : BACK_PAUSE_WITH_PEERS_MS;
            main.postDelayed(scanCycle, wait);
        }
    };

    private void startScan() {
        if (scanning) return;
        try {
            // Période très courte en arrière-plan : autant écouter à fond pendant qu'elle dure.
            // À l'écran sans Connect ouvert, les périodes sont longues : mode équilibré.
            int mode = onScreen && !eager ? ScanSettings.SCAN_MODE_BALANCED : ScanSettings.SCAN_MODE_LOW_LATENCY;
            ScanSettings settings = new ScanSettings.Builder()
                    .setScanMode(mode)
                    .build();
            List<ScanFilter> filters = Collections.singletonList(
                    new ScanFilter.Builder().setServiceUuid(new ParcelUuid(SERVICE)).build());
            scanner.startScan(filters, settings, scanEvents);
            scanning = true;
        } catch (RuntimeException e) {
            Log.w(TAG, "Recherche refusée : " + e.getClass().getSimpleName());
        }
    }

    private void stopScan() {
        if (!scanning) return;
        scanning = false;
        try {
            scanner.stopScan(scanEvents);
        } catch (RuntimeException ignored) {
            // Bluetooth coupé entre-temps.
        }
    }

    private final ScanCallback scanEvents = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            if (running) call(result.getDevice(), result.getRssi());
        }

        @Override
        public void onScanFailed(int code) {
            scanning = false;
            Log.w(TAG, "Recherche échouée : " + code);
        }
    };

    private void call(BluetoothDevice device, int rssi) {
        String address = device.getAddress();
        Long until = backoff.get(address);
        long now = System.currentTimeMillis();
        if (links.containsKey(address) || links.size() >= MAX_LINKS || rssi < MIN_RSSI) return;
        if (until != null && now < until) return;
        Log.i(TAG, "Voisin trouvé");
        BluetoothGatt gatt = device.connectGatt(context, false, clientEvents, BluetoothDevice.TRANSPORT_LE);
        if (gatt == null) return;
        Link link = new Link(address, gatt, device);
        links.put(address, link);
        main.postDelayed(() -> giveUp(link), CONNECT_TIMEOUT_MS);
    }

    /** Connexion toujours pas prête : on la coupe et on retente au prochain passage. */
    private void giveUp(Link link) {
        if (link.ready || links.get(link.address) != link) return;
        Log.w(TAG, "Connexion trop lente, abandon");
        avoid(link.address, FAILED_BACKOFF_MS);
        link.gatt.disconnect();
        link.gatt.close();
        forget(link);
    }

    private void avoid(String address) {
        avoid(address, BACKOFF_MS);
    }

    private void avoid(String address, long ms) {
        backoff.put(address, System.currentTimeMillis() + ms);
    }

    /**
     * Seul l'appelant règle le rythme de la liaison. Au plus lent, chaque morceau attend
     * son tour (0,1 s ou plus) : un message de quelques Ko prenait plusieurs secondes.
     */
    private void setFast(Link link, boolean value) {
        if (!link.weCalled() || !link.ready || links.get(link.address) != link) return;
        main.removeCallbacks(link.slowDown);
        if (value) main.postDelayed(link.slowDown, FAST_IDLE_MS);
        if (link.fast == value) return;
        link.fast = value;
        link.gatt.requestConnectionPriority(value
                ? BluetoothGatt.CONNECTION_PRIORITY_HIGH
                : BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER);
    }

    // --- Quand on appelle un voisin

    private final BluetoothGattCallback clientEvents = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int state) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link == null || link.gatt != gatt) {
                    gatt.close();
                } else if (state == BluetoothProfile.STATE_CONNECTED && status == BluetoothGatt.GATT_SUCCESS) {
                    gatt.requestMtu(WANTED_MTU);
                } else {
                    if (!link.ready) {
                        Log.w(TAG, "Connexion échouée : " + status);
                        avoid(link.address, FAILED_BACKOFF_MS);
                    }
                    gatt.close();
                    forget(link);
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothGatt gatt, int mtu, int status) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link == null) return;
                if (status == BluetoothGatt.GATT_SUCCESS) link.payload = payloadFor(mtu);
                gatt.discoverServices();
            });
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link == null) return;
                BluetoothGattService service = gatt.getService(SERVICE);
                BluetoothGattCharacteristic pipe = service == null ? null : service.getCharacteristic(PIPE);
                if (pipe == null) {
                    avoid(link.address);
                    gatt.disconnect();
                    return;
                }
                link.pipe = pipe;
                gatt.setCharacteristicNotification(pipe, true);
                BluetoothGattDescriptor cccd = pipe.getDescriptor(CCCD);
                cccd.setValue(BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE);
                gatt.writeDescriptor(cccd);
            });
        }

        @Override
        public void onDescriptorWrite(BluetoothGatt gatt, BluetoothGattDescriptor descriptor, int status) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link == null) return;
                link.ready = true;
                // Liaison au repos la plupart du temps : rythme le plus lent.
                gatt.requestConnectionPriority(BluetoothGatt.CONNECTION_PRIORITY_LOW_POWER);
                sayHello(link);
            });
        }

        @Override
        public void onCharacteristicWrite(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, int status) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link == null) return;
                link.busy = false;
                pump(link);
            });
        }

        /** Android 13+ : la valeur arrive à part. L'ancienne version lit un objet partagé, écrasé par le morceau suivant. */
        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
            arrived(gatt, value.clone());
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            arrived(gatt, characteristic.getValue().clone());
        }

        private void arrived(BluetoothGatt gatt, byte[] frame) {
            main.post(() -> {
                Link link = links.get(gatt.getDevice().getAddress());
                if (link != null) receive(link, frame);
            });
        }
    };

    // --- Quand un voisin nous appelle

    private final BluetoothGattServerCallback serverEvents = new BluetoothGattServerCallback() {
        @Override
        public void onConnectionStateChange(BluetoothDevice device, int status, int state) {
            main.post(() -> {
                Link link = links.get(device.getAddress());
                if (state == BluetoothProfile.STATE_CONNECTED) {
                    if (link == null && running) links.put(device.getAddress(), new Link(device.getAddress(), null, device));
                } else if (link != null && !link.weCalled()) {
                    forget(link);
                }
            });
        }

        @Override
        public void onMtuChanged(BluetoothDevice device, int mtu) {
            main.post(() -> {
                Link link = links.get(device.getAddress());
                if (link != null && !link.weCalled()) link.payload = payloadFor(mtu);
            });
        }

        @Override
        public void onDescriptorWriteRequest(BluetoothDevice device, int requestId, BluetoothGattDescriptor descriptor,
                                             boolean prepared, boolean needResponse, int offset, byte[] value) {
            if (needResponse && server != null) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
            main.post(() -> {
                Link link = links.get(device.getAddress());
                if (link == null || link.weCalled()) return;
                link.ready = true;
                sayHello(link);
            });
        }

        @Override
        public void onCharacteristicWriteRequest(BluetoothDevice device, int requestId, BluetoothGattCharacteristic characteristic,
                                                 boolean prepared, boolean needResponse, int offset, byte[] value) {
            if (needResponse && server != null) server.sendResponse(device, requestId, BluetoothGatt.GATT_SUCCESS, 0, null);
            byte[] frame = value.clone();
            main.post(() -> {
                Link link = links.get(device.getAddress());
                if (link != null && !link.weCalled()) receive(link, frame);
            });
        }

        @Override
        public void onNotificationSent(BluetoothDevice device, int status) {
            main.post(() -> {
                Link link = links.get(device.getAddress());
                if (link == null || link.weCalled()) return;
                link.busy = false;
                pump(link);
            });
        }
    };

    // --- Envoi et réception

    private void sayHello(Link link) {
        link.out.add(frame(HELLO, 0, 0, 1, self.getBytes(StandardCharsets.UTF_8), 0, self.length()));
        pump(link);
    }

    /** Renvoie false si ce voisin n'est plus joignable. */
    boolean send(String peer, byte[] data) {
        Link link = linkTo(peer);
        if (link == null) return false;
        byte[] checked = ByteBuffer.allocate(CHECK_BYTES + data.length).putLong(crc(data)).put(data).array();
        int size = Math.max(1, link.payload);
        int total = Math.max(1, (checked.length + size - 1) / size);
        int message = nextMessage++ & 0xFFFF;
        setFast(link, true);
        for (int i = 0; i < total; i++) {
            int start = i * size;
            link.out.add(frame(DATA, message, i, total, checked, start, Math.min(size, checked.length - start)));
        }
        pump(link);
        return true;
    }

    private static int payloadFor(int mtu) {
        return Math.min(MAX_PAYLOAD, mtu - ATT_OVERHEAD - HEADER);
    }

    private static long crc(byte[] data) {
        CRC32 crc = new CRC32();
        crc.update(data);
        return crc.getValue();
    }

    private Link linkTo(String peer) {
        for (Link link : links.values()) if (peer.equals(link.peer)) return link;
        return null;
    }

    private static byte[] frame(byte type, int message, int index, int total, byte[] data, int start, int length) {
        return ByteBuffer.allocate(HEADER + length).put(type).putShort((short) message).putShort((short) index)
                .putShort((short) total).put(data, start, length).array();
    }

    /** Un seul morceau à la fois : Android perd les suivants sinon. */
    private void pump(Link link) {
        if (link.busy || link.out.isEmpty() || !links.containsKey(link.address)) return;
        byte[] next = link.out.peek();
        boolean accepted;
        if (link.weCalled()) {
            link.pipe.setWriteType(BluetoothGattCharacteristic.WRITE_TYPE_DEFAULT);
            link.pipe.setValue(next);
            accepted = link.gatt.writeCharacteristic(link.pipe);
        } else if (server != null) {
            serverPipe.setValue(next);
            accepted = server.notifyCharacteristicChanged(link.device, serverPipe, false);
        } else {
            return;
        }
        if (accepted) {
            link.out.poll();
            link.busy = true;
        } else {
            main.postDelayed(() -> pump(link), BUSY_RETRY_MS);
        }
    }

    private void receive(Link link, byte[] frame) {
        if (frame.length < HEADER) return;
        ByteBuffer buffer = ByteBuffer.wrap(frame);
        byte type = buffer.get();
        int message = buffer.getShort() & 0xFFFF;
        int index = buffer.getShort() & 0xFFFF;
        int total = buffer.getShort() & 0xFFFF;
        byte[] body = new byte[buffer.remaining()];
        buffer.get(body);
        if (type == HELLO) {
            hello(link, new String(body, StandardCharsets.UTF_8));
            return;
        }
        if (link.peer == null) return;
        setFast(link, true);
        byte[] complete = link.incoming.add(message, index, total, body);
        if (complete == null || complete.length < CHECK_BYTES) return;
        ByteBuffer whole = ByteBuffer.wrap(complete);
        long expected = whole.getLong();
        byte[] data = new byte[whole.remaining()];
        whole.get(data);
        if (crc(data) != expected) {
            Log.w(TAG, "Message abîmé en route, ignoré");
            return;
        }
        events.onData(link.peer, data);
    }

    private void hello(Link link, String peer) {
        if (peer.equals(self) || peer.isEmpty()) return;
        Link other = linkTo(peer);
        if (other != null && other != link) {
            // Les deux se sont appelés : les deux téléphones gardent la même liaison, celle de l'appelant le plus petit.
            String thisCaller = link.weCalled() ? self : peer;
            String otherCaller = other.weCalled() ? self : peer;
            Link loser = thisCaller.compareTo(otherCaller) < 0 ? other : link;
            Link winner = loser == link ? other : link;
            loser.peer = null;
            drop(loser);
            if (winner == other) return;
        }
        boolean isNew = link.peer == null;
        link.peer = peer;
        if (isNew && other == null) {
            Log.i(TAG, "Voisin connecté");
            events.onPeerUp(peer);
        }
    }

    private void drop(Link link) {
        avoid(link.address);
        if (link.gatt != null) link.gatt.disconnect();
        else if (server != null) server.cancelConnection(link.device);
    }

    private void forget(Link link) {
        main.removeCallbacks(link.slowDown);
        links.remove(link.address);
        String peer = link.peer;
        if (peer != null && linkTo(peer) == null) {
            Log.i(TAG, "Voisin déconnecté");
            events.onPeerDown(peer);
        }
    }
}
