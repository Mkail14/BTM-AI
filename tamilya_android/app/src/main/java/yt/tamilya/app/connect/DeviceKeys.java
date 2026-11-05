package yt.tamilya.app.connect;

import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.io.IOException;
import java.security.GeneralSecurityException;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.Certificate;
import java.security.spec.ECGenParameterSpec;

/** Clé de l'appareil : ECDSA P-256 dans l'Android Keystore, jamais exportable. */
final class DeviceKeys {
    private static final String ALIAS = "tamilya-connect-device";

    private DeviceKeys() {}

    static synchronized KeyPair get() throws GeneralSecurityException, IOException {
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        Certificate certificate = store.getCertificate(ALIAS);
        if (certificate != null) {
            return new KeyPair(certificate.getPublicKey(), (PrivateKey) store.getKey(ALIAS, null));
        }
        KeyPairGenerator generator = KeyPairGenerator.getInstance(KeyProperties.KEY_ALGORITHM_EC, "AndroidKeyStore");
        generator.initialize(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_SIGN)
                .setAlgorithmParameterSpec(new ECGenParameterSpec("secp256r1"))
                .setDigests(KeyProperties.DIGEST_SHA256)
                .build());
        return generator.generateKeyPair();
    }
}
