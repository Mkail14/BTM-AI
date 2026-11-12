package yt.tamilya.app;

import org.json.JSONException;
import org.json.JSONObject;

/** Un message de la conversation native, comme UiMessage du site (MessageItem.tsx). */
final class ChatMessage {
    static final String COMPLETE = "complete", STREAMING = "streaming", INTERRUPTED = "interrupted", ERROR = "error";

    final String role;
    final StringBuilder content = new StringBuilder();
    String status;
    /** Information sous le message (erreur, réponse coupée…). */
    String notice;

    ChatMessage(String role, String content, String status) {
        this.role = role;
        this.content.append(content);
        this.status = status;
    }

    boolean mine() {
        return "user".equals(role);
    }

    String text() {
        return content.toString();
    }

    /** Échange réussi, à renvoyer au serveur dans l'historique d'un visiteur sans compte. */
    boolean settled() {
        return (COMPLETE.equals(status) || INTERRUPTED.equals(status)) && !text().trim().isEmpty();
    }

    JSONObject toJson() {
        try {
            return new JSONObject().put("role", role).put("content", text()).put("status", status)
                    .put("notice", notice == null ? JSONObject.NULL : notice);
        } catch (JSONException e) {
            throw new IllegalStateException(e);
        }
    }

    static ChatMessage fromJson(JSONObject json) {
        String status = json.optString("status", COMPLETE);
        // L'app s'est arrêtée pendant une réponse : elle reste coupée, pas « en cours ».
        if (STREAMING.equals(status)) status = INTERRUPTED;
        ChatMessage message = new ChatMessage(json.optString("role", "assistant"), json.optString("content", ""), status);
        if (!json.isNull("notice")) message.notice = json.optString("notice");
        return message;
    }
}
