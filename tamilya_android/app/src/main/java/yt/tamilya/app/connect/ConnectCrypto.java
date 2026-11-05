package yt.tamilya.app.connect;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.PublicKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.ECGenParameterSpec;
import java.security.spec.X509EncodedKeySpec;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyAgreement;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * Chiffrement de Tamilya Connect. Rien d'Android ici : ces fonctions se testent sur
 * l'ordinateur, contre la même chose faite par WebCrypto (le serveur).
 *
 * Demande : clé éphémère P-256, ECDH avec la clé du serveur, HKDF-SHA256 (sel vide,
 * info « tamilya-connect v1 »), AES-256-GCM (nonce de 12 octets, étiquette de 16 octets
 * à la fin du texte chiffré, comme WebCrypto). Réponse : AES-256-GCM avec replyKey.
 */
public final class ConnectCrypto {
    public static final String HKDF_INFO = "tamilya-connect v1";
    public static final int NONCE_BYTES = 12;
    public static final int KEY_BYTES = 32;

    private static final SecureRandom RANDOM = new SecureRandom();

    private ConnectCrypto() {}

    public static String b64(byte[] bytes) {
        return Base64.getEncoder().encodeToString(bytes);
    }

    public static byte[] unb64(String text) {
        return Base64.getDecoder().decode(text);
    }

    public static byte[] random(int size) {
        byte[] bytes = new byte[size];
        RANDOM.nextBytes(bytes);
        return bytes;
    }

    /** Clé publique P-256 au format SPKI (base64). */
    public static PublicKey publicKey(String spkiB64) throws GeneralSecurityException {
        return KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(unb64(spkiB64)));
    }

    public static KeyPair newKeyPair() throws GeneralSecurityException {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("EC");
        generator.initialize(new ECGenParameterSpec("secp256r1"), RANDOM);
        return generator.generateKeyPair();
    }

    static byte[] ecdh(PrivateKey mine, PublicKey theirs) throws GeneralSecurityException {
        KeyAgreement agreement = KeyAgreement.getInstance("ECDH");
        agreement.init(mine);
        agreement.doPhase(theirs, true);
        return agreement.generateSecret();
    }

    /** HKDF-SHA256 (RFC 5869). Un sel vide vaut 32 zéros, comme dans WebCrypto. */
    static byte[] hkdf(byte[] ikm, byte[] salt, byte[] info, int length) throws GeneralSecurityException {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(salt.length == 0 ? new byte[32] : salt, "HmacSHA256"));
        byte[] prk = mac.doFinal(ikm);
        mac.init(new SecretKeySpec(prk, "HmacSHA256"));
        byte[] out = new byte[length];
        byte[] block = new byte[0];
        int written = 0;
        for (int counter = 1; written < length; counter++) {
            mac.update(block);
            mac.update(info);
            mac.update((byte) counter);
            block = mac.doFinal();
            int size = Math.min(block.length, length - written);
            System.arraycopy(block, 0, out, written, size);
            written += size;
        }
        return out;
    }

    static byte[] requestKey(byte[] sharedSecret) throws GeneralSecurityException {
        return hkdf(sharedSecret, new byte[0], HKDF_INFO.getBytes(StandardCharsets.UTF_8), KEY_BYTES);
    }

    public static byte[] encrypt(byte[] key, byte[] nonce, byte[] plain) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        return cipher.doFinal(plain);
    }

    public static byte[] decrypt(byte[] key, byte[] nonce, byte[] sealed) throws GeneralSecurityException {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(128, nonce));
        return cipher.doFinal(sealed);
    }

    /** ECDSA P-256 / SHA-256, signature au format DER. */
    public static byte[] sign(PrivateKey key, String data) throws GeneralSecurityException {
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initSign(key);
        signature.update(data.getBytes(StandardCharsets.UTF_8));
        return signature.sign();
    }

    public static boolean verify(PublicKey key, String data, byte[] der) throws GeneralSecurityException {
        Signature signature = Signature.getInstance("SHA256withECDSA");
        signature.initVerify(key);
        signature.update(data.getBytes(StandardCharsets.UTF_8));
        return signature.verify(der);
    }

    /** Ce qu'une demande transporte, en base64, prêt pour l'enveloppe. */
    public static final class Sealed {
        public final String epk;
        public final String nonce;
        public final String ct;

        Sealed(String epk, String nonce, String ct) {
            this.epk = epk;
            this.nonce = nonce;
            this.ct = ct;
        }
    }

    /** Chiffre pour le serveur : seul lui pourra lire (les relais ne voient que du bruit). */
    public static Sealed seal(PublicKey server, byte[] plain) throws GeneralSecurityException {
        KeyPair ephemeral = newKeyPair();
        byte[] key = requestKey(ecdh(ephemeral.getPrivate(), server));
        byte[] nonce = random(NONCE_BYTES);
        return new Sealed(b64(ephemeral.getPublic().getEncoded()), b64(nonce), b64(encrypt(key, nonce, plain)));
    }

    /** Le travail du serveur, pour les tests seulement. */
    static byte[] unseal(PrivateKey server, String epk, String nonce, String ct) throws GeneralSecurityException {
        byte[] key = requestKey(ecdh(server, publicKey(epk)));
        return decrypt(key, unb64(nonce), unb64(ct));
    }
}
