package com.narudzbine.identity.application;

import java.io.IOException;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;
import org.springframework.stereotype.Component;

@Component
public final class SupportedLocales {
    private final Map<String, String> tags;
    private final List<String> roster;

    public SupportedLocales() {
        this(load());
    }

    public SupportedLocales(List<String> canonicalTags) {
        var values = new HashMap<String, String>();
        for (String tag : canonicalTags) {
            if (tag == null || tag.length() > 64 || !tag.matches("[A-Za-z]{2,8}(-[A-Za-z0-9]{1,8})*")
                    || !Locale.forLanguageTag(tag).toLanguageTag().equals(tag)
                    || values.putIfAbsent(tag.toLowerCase(Locale.ROOT), tag) != null) {
                throw new IllegalArgumentException("Invalid canonical locale roster.");
            }
        }
        if (!values.containsKey("en")) { throw new IllegalArgumentException("English fallback must be configured."); }
        tags = Map.copyOf(values);
        roster = List.copyOf(canonicalTags);
    }

    public List<String> roster() { return roster; }

    public String canonical(String input) {
        if (input == null || input.length() > 64 || !input.matches("[A-Za-z0-9-]+")) {
            throw new IllegalArgumentException("Unsupported language.");
        }
        String tag = tags.get(input.toLowerCase(Locale.ROOT));
        if (tag == null) { throw new IllegalArgumentException("Unsupported language."); }
        return tag;
    }

    private static List<String> load() {
        try (var stream = SupportedLocales.class.getResourceAsStream("/i18n/locales.properties")) {
            if (stream == null) { throw new IllegalStateException("Locale roster is unavailable."); }
            var properties = new Properties();
            properties.load(stream);
            String roster = properties.getProperty("supported");
            if (roster == null) { throw new IllegalStateException("Locale roster is unavailable."); }
            return List.of(roster.split(",", -1));
        } catch (IOException exception) { throw new IllegalStateException("Locale roster is unavailable."); }
    }
}
