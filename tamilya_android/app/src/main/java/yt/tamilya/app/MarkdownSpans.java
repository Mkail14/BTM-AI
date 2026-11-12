package yt.tamilya.app;

import android.graphics.Typeface;
import android.net.Uri;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.TextPaint;
import android.text.style.BulletSpan;
import android.text.style.ClickableSpan;
import android.text.style.ForegroundColorSpan;
import android.text.style.LeadingMarginSpan;
import android.text.style.RelativeSizeSpan;
import android.text.style.StyleSpan;
import android.text.style.TypefaceSpan;
import android.view.View;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Mise en forme Android du Markdown léger des réponses de Tamilya : titres, gras, italique,
 * code, listes, citations, liens et [[mots]] (shimaoré à apprendre, en rose). Le texte a déjà
 * été débarrassé des cartes par ChatMarkdown.split.
 */
final class MarkdownSpans {
    interface Links {
        void open(Uri uri);
    }

    private static final Pattern INLINE = Pattern.compile(
            "\\*\\*(.+?)\\*\\*|__(.+?)__|(?<![\\w*])\\*(?!\\s)(.+?)(?<!\\s)\\*(?!\\w)|(?<![\\w_])_(?!\\s)(.+?)(?<!\\s)_(?!\\w)"
                    + "|`([^`]+)`|\\[\\[([^\\]]+)\\]\\]|\\[([^\\]]+)\\]\\(([^)\\s]+)\\)|(https?://[^\\s<>()]+[^\\s<>().,;:!?])");

    private MarkdownSpans() {}

    static Spanned render(String markdown, SiteTheme theme, int dpUnit, Links links) {
        SpannableStringBuilder out = new SpannableStringBuilder();
        String[] lines = markdown.split("\n", -1);
        StringBuilder paragraph = new StringBuilder();
        boolean inCode = false;
        int codeStart = 0;
        for (String raw : lines) {
            String line = raw.replace("\r", "");
            if (line.trim().startsWith("```")) {
                if (!inCode) {
                    flushParagraph(out, paragraph, theme, dpUnit, links);
                    inCode = true;
                    codeStart = out.length();
                } else {
                    inCode = false;
                    if (out.length() > codeStart) {
                        out.setSpan(new TypefaceSpan("monospace"), codeStart, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        out.setSpan(new RelativeSizeSpan(0.9f), codeStart, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                    }
                    out.append("\n");
                }
                continue;
            }
            if (inCode) {
                out.append(line).append("\n");
                continue;
            }
            String trimmed = line.trim();
            if (trimmed.isEmpty()) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                continue;
            }
            if (trimmed.matches("^(-{3,}|\\*{3,}|_{3,})$")) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                continue;
            }
            Matcher heading = Pattern.compile("^(#{1,6})\\s+(.*)$").matcher(trimmed);
            if (heading.matches()) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                int start = out.length();
                inline(out, heading.group(2), theme, links);
                out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new RelativeSizeSpan(heading.group(1).length() <= 2 ? 1.15f : 1.05f), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.append("\n\n");
                continue;
            }
            Matcher bullet = Pattern.compile("^[-*+]\\s+(.*)$").matcher(trimmed);
            if (bullet.matches()) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                int start = out.length();
                inline(out, bullet.group(1), theme, links);
                out.append("\n");
                out.setSpan(new BulletSpan(dpUnit * 10, theme.fgMuted), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new LeadingMarginSpan.Standard(dpUnit * 4, dpUnit * 4), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                continue;
            }
            Matcher numbered = Pattern.compile("^(\\d{1,3})[.)]\\s+(.*)$").matcher(trimmed);
            if (numbered.matches()) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                int start = out.length();
                out.append(numbered.group(1)).append(". ");
                out.setSpan(new ForegroundColorSpan(theme.fgMuted), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                inline(out, numbered.group(2), theme, links);
                out.append("\n");
                out.setSpan(new LeadingMarginSpan.Standard(dpUnit * 4, dpUnit * 22), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                continue;
            }
            if (trimmed.startsWith(">")) {
                flushParagraph(out, paragraph, theme, dpUnit, links);
                int start = out.length();
                inline(out, trimmed.replaceFirst("^>\\s?", ""), theme, links);
                out.append("\n");
                out.setSpan(new StyleSpan(Typeface.ITALIC), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new ForegroundColorSpan(theme.fgMuted), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new LeadingMarginSpan.Standard(dpUnit * 12), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                continue;
            }
            // Ligne ordinaire : les lignes qui se suivent forment un paragraphe (retour simple = espace).
            if (paragraph.length() > 0) paragraph.append(' ');
            paragraph.append(trimmed);
        }
        flushParagraph(out, paragraph, theme, dpUnit, links);
        // Pas de lignes vides en fin de texte.
        int end = out.length();
        while (end > 0 && out.charAt(end - 1) == '\n') end--;
        out.delete(end, out.length());
        return out;
    }

    private static void flushParagraph(SpannableStringBuilder out, StringBuilder paragraph, SiteTheme theme, int dpUnit, Links links) {
        if (paragraph.length() == 0) return;
        if (out.length() > 0 && !endsWithBlank(out)) out.append("\n");
        inline(out, paragraph.toString(), theme, links);
        out.append("\n\n");
        paragraph.setLength(0);
    }

    private static boolean endsWithBlank(CharSequence text) {
        int n = text.length();
        return n >= 2 && text.charAt(n - 1) == '\n' && text.charAt(n - 2) == '\n';
    }

    /** Gras, italique, code, [[mot]], liens. */
    static void inline(SpannableStringBuilder out, String text, SiteTheme theme, Links links) {
        Matcher m = INLINE.matcher(text);
        int from = 0;
        while (m.find()) {
            out.append(text, from, m.start());
            int start = out.length();
            if (m.group(1) != null || m.group(2) != null) {
                inline(out, m.group(1) != null ? m.group(1) : m.group(2), theme, links);
                out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (m.group(3) != null || m.group(4) != null) {
                inline(out, m.group(3) != null ? m.group(3) : m.group(4), theme, links);
                out.setSpan(new StyleSpan(Typeface.ITALIC), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (m.group(5) != null) {
                out.append(m.group(5));
                out.setSpan(new TypefaceSpan("monospace"), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new RelativeSizeSpan(0.92f), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (m.group(6) != null) {
                // Mot que Tamilya signale (à apprendre en shimaoré) : en rose, comme sur le site.
                out.append(m.group(6));
                out.setSpan(new ForegroundColorSpan(theme.accent), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                out.setSpan(new StyleSpan(Typeface.BOLD), start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
            } else if (m.group(7) != null) {
                inline(out, m.group(7), theme, links);
                link(out, start, m.group(8), theme, links);
            } else if (m.group(9) != null) {
                out.append(m.group(9));
                link(out, start, m.group(9), theme, links);
            }
            from = m.end();
        }
        out.append(text, from, text.length());
    }

    private static void link(SpannableStringBuilder out, int start, String href, SiteTheme theme, Links links) {
        Uri uri;
        try {
            uri = Uri.parse(href);
        } catch (RuntimeException e) {
            return;
        }
        String scheme = uri.getScheme();
        if (scheme == null || !(scheme.equals("https") || scheme.equals("http") || scheme.equals("mailto") || scheme.equals("tel"))) return;
        out.setSpan(new ClickableSpan() {
            @Override
            public void onClick(View widget) {
                if (links != null) links.open(uri);
            }

            @Override
            public void updateDrawState(TextPaint paint) {
                paint.setColor(theme.accent);
                paint.setUnderlineText(true);
            }
        }, start, out.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
}
