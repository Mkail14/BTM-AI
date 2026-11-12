package yt.tamilya.app;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Texte des réponses de Tamilya : Markdown léger, et blocs ``` de cartes (ticket de barge,
 * commande…) que seul le site sait afficher. Ici, le texte est découpé en morceaux : du texte
 * à mettre en forme, et des cartes, montrées comme un bouton qui ouvre la conversation sur le site.
 * Tout est en Java pur pour être testé sur l'ordinateur ; la mise en forme Android est dans HomeScreen.
 */
final class ChatMarkdown {
    /** Noms des blocs de cartes du site (src/lib/… *_BLOCK). */
    static final Set<String> CARDS = new HashSet<>(Arrays.asList(
            "ticket-barge", "devis-btm", "carte-cyclones", "document-a-signer", "commande-groupee",
            "commande-repas", "lecture-3d", "chanson", "itineraire", "tableau-combine", "creneaux-code",
            "attestation-hebergement"));

    /** Un morceau : du texte, ou une carte (nom du bloc, texte brut du bloc). */
    static final class Part {
        final String text;
        final String card;

        private Part(String text, String card) {
            this.text = text;
            this.card = card;
        }

        boolean isCard() {
            return card != null;
        }
    }

    private ChatMarkdown() {}

    /** Libellé du bouton d'une carte. */
    static String cardLabel(String name) {
        switch (name) {
            case "ticket-barge": return "Ticket de barge";
            case "devis-btm": return "Devis BTM";
            case "carte-cyclones": return "Carte des cyclones";
            case "document-a-signer": return "Document à signer";
            case "commande-groupee":
            case "commande-repas": return "Commande de repas";
            case "lecture-3d": return "Lecture";
            case "chanson": return "Chanson";
            case "itineraire": return "Itinéraire";
            case "tableau-combine": return "Tableau";
            case "creneaux-code": return "Créneaux du code";
            case "attestation-hebergement": return "Attestation d'hébergement";
            default: return "Carte";
        }
    }

    /** Un bloc ``` est une carte s'il porte un nom connu (ou un nom à tiret, comme toutes les cartes). */
    static boolean isCard(String name) {
        return CARDS.contains(name) || (name.contains("-") && name.matches("[a-z0-9-]+"));
    }

    /**
     * Découpe le texte : les blocs ``` de cartes deviennent des morceaux à part. Comme sur le site
     * (block-fence.ts), un bloc collé au bout d'une phrase (« Ok. ```ticket-barge pieton 1 ») est
     * reconnu aussi. Un bloc sans fin (réponse encore en cours) est une carte jusqu'au bout du texte.
     */
    static List<Part> split(String markdown) {
        List<Part> parts = new ArrayList<>();
        if (markdown == null || markdown.isEmpty()) return parts;
        Matcher open = Pattern.compile("```([a-zA-Z0-9_+-]*)[ \\t]*").matcher(markdown);
        int from = 0;
        while (open.find(from)) {
            String name = open.group(1);
            int start = open.start();
            int bodyStart = open.end();
            int close = markdown.indexOf("```", bodyStart);
            int end = close < 0 ? markdown.length() : close + 3;
            String body = markdown.substring(bodyStart, close < 0 ? markdown.length() : close).trim();
            if (isCard(name)) {
                addText(parts, markdown.substring(from, start));
                parts.add(new Part(body, name));
            } else {
                // Vrai bout de code : gardé dans le texte, mis en forme par le rendu.
                addText(parts, markdown.substring(from, end));
            }
            from = end;
        }
        addText(parts, markdown.substring(from));
        return parts;
    }

    private static void addText(List<Part> parts, String text) {
        String clean = text.replaceAll("^\\s*\\n+|\\n+\\s*$|[ \\t]+$", "");
        if (clean.trim().isEmpty()) return;
        parts.add(new Part(clean, null));
    }

    /** Texte sans mise en forme, pour copier ou pour l'historique local. */
    static String plain(String markdown) {
        StringBuilder out = new StringBuilder();
        for (Part part : split(markdown)) {
            if (part.isCard()) continue;
            out.append(part.text
                    .replaceAll("\\[\\[([^\\]]+)\\]\\]", "$1")
                    .replaceAll("\\[([^\\]]+)\\]\\([^)]+\\)", "$1")
                    .replaceAll("(?m)^#{1,6}\\s+", "")
                    .replaceAll("[*_`]", "")).append("\n");
        }
        return out.toString().trim();
    }
}
