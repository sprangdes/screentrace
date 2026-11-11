package io.screentrace.adapter.struts;

import static io.screentrace.adapter.struts.StrutsGraphSupport.*;

import io.screentrace.adapter.struts.StrutsModel.MessageResource;
import io.screentrace.adapter.struts.StrutsModel.State;
import io.screentrace.core.ApplicationGraph.*;
import io.screentrace.scanner.SafeProjectFiles;
import java.io.*;
import java.nio.file.*;
import java.util.*;
import org.w3c.dom.*;

/** Message resource bundles and message key resolution. */
final class StrutsMessages {
  private StrutsMessages() {}

  static void readMessages(State state) {
    List<MessageResource> resources = new ArrayList<>();
    for (Path config : state.inventory.strutsConfigFiles())
      try {
        for (Element resource :
            StrutsSources.elements(readXml(config, state), "message-resources")) {
          String parameter = resource.getAttribute("parameter").replace('.', '/'),
              key = resource.getAttribute("key");
          if (parameter.isBlank()) continue;
          if (state.defaultMessageBundle == null && key.isBlank())
            state.defaultMessageBundle = parameter;
          resources.add(new MessageResource(key, parameter));
          if (!key.isBlank()) state.messageBundleAliases.put(key, parameter);
        }
      } catch (Exception error) {
        diagnostic(
            state,
            "訊息資源設定未解析",
            new SourceLocation(relative(state, config), 1),
            "MESSAGE_RESOURCE_UNRESOLVED");
      }
    for (MessageResource resource : resources) {
      List<Path> matches =
          state.inventory.files().stream()
              .filter(
                  file ->
                      file.toString().endsWith(".properties")
                          && relative(state, file).endsWith(resource.parameter() + ".properties"))
              .sorted()
              .toList();
      Map<String, Set<String>> values = new TreeMap<>();
      for (Path file : matches)
        try {
          Properties properties = new Properties();
          properties.load(
              new StringReader(
                  SafeProjectFiles.readUtf8Limited(
                      state.inventory.root(), file, SafeProjectFiles.MAX_SOURCE_FILE_BYTES)));
          Map<String, String> bundle =
              state.messageBundles.computeIfAbsent(
                  resource.parameter(), ignored -> new TreeMap<>());
          for (String key : properties.stringPropertyNames()) {
            String value = properties.getProperty(key);
            values.computeIfAbsent(key, ignored -> new TreeSet<>()).add(value);
            bundle.putIfAbsent(key, value);
            state.messages.computeIfAbsent(key, k -> new TreeSet<>()).add(value);
          }
        } catch (Exception error) {
          diagnostic(
              state,
              "訊息資源無法讀取",
              new SourceLocation(relative(state, file), 1),
              "MESSAGE_RESOURCE_UNRESOLVED");
        }
      for (var entry : values.entrySet())
        if (entry.getValue().size() > 1)
          state.messageBundles.getOrDefault(resource.parameter(), Map.of()).remove(entry.getKey());
    }
  }

  static String resolveMessage(State state, String bundle, String key) {
    String selected =
        bundle == null || bundle.isBlank()
            ? state.defaultMessageBundle
            : state.messageBundleAliases.getOrDefault(bundle, bundle.replace('.', '/'));
    String value =
        selected == null ? null : state.messageBundles.getOrDefault(selected, Map.of()).get(key);
    return value == null ? "（訊息 key：" + key + "）" : value;
  }
}
