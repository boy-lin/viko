import { warn, debug, info, error } from "@tauri-apps/plugin-log";

function forwardConsole(
  fnName: "log" | "debug" | "info" | "warn" | "error",
  logger: (message: string) => Promise<void>
) {
  const original = console[fnName];
  console[fnName] = (...args) => {
    original(...args);
    logger(args.join("\n"));
  };
}

// forwardConsole("log", trace);
forwardConsole("debug", debug);
forwardConsole("info", info);
forwardConsole("warn", warn);
forwardConsole("error", error);
