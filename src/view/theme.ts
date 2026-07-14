// Dark/light theme: prefers-color-scheme default, explicit toggle, localStorage
// persistence (plan §6). Mirrors the prototype's behavior.

const KEY = "sr-theme";
type Theme = "dark" | "light";

function read(): Theme | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
}

function write(t: Theme): void {
  try {
    localStorage.setItem(KEY, t);
  } catch {
    /* storage unavailable (private mode) — theme still applies for the session */
  }
}

function systemTheme(): Theme {
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function apply(t: Theme, button: HTMLButtonElement): void {
  document.documentElement.dataset.theme = t;
  button.textContent = t === "dark" ? "☀ light" : "☾ dark";
}

/** Wire a theme toggle button and apply the initial theme. */
export function initTheme(button: HTMLButtonElement): void {
  apply(read() ?? systemTheme(), button);
  button.addEventListener("click", () => {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    apply(next, button);
    write(next);
  });
}
