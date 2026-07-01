export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function clearElement(element) {
  if (element) element.innerHTML = "";
}

export function createElement(tag, options = {}, children = []) {
  const element = document.createElement(tag);

  Object.entries(options).forEach(([key, value]) => {
    if (value == null) return;

    if (key === "className") {
      element.className = value;
    } else if (key === "text") {
      element.textContent = value;
    } else if (key === "html") {
      element.innerHTML = value;
    } else if (key === "dataset") {
      Object.assign(element.dataset, value);
    } else if (key.startsWith("on") && typeof value === "function") {
      element.addEventListener(key.slice(2).toLowerCase(), value);
    } else {
      element.setAttribute(key, value);
    }
  });

  children.forEach(child => {
    if (child == null) return;
    element.append(child.nodeType ? child : document.createTextNode(String(child)));
  });

  return element;
}

export function showToast(message, tone = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.dataset.tone = tone;
  toast.hidden = false;
  window.clearTimeout(showToast.timeoutId);
  showToast.timeoutId = window.setTimeout(() => {
    toast.hidden = true;
  }, 3600);
}

export function scrollToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function getFormResponses(form) {
  const formData = new FormData(form);
  return Object.fromEntries(formData.entries());
}

export function setViewTitle(title) {
  document.title = title ? `${title} · English Selectividad` : "English Selectividad";
}
