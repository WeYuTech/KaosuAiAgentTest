export { cn } from "cn"

// Radix Portal 留在元件宿主內，讓命名空間樣式與宿主隔離一致。
export function resolvePortalContainer(container?: Element | DocumentFragment | null) {
  if (container) return container
  if (typeof document === "undefined") return undefined
  return document.getElementById("mes-ai-chat-root")
    ?? document.getElementById("mes-ai-preview-root")
    ?? undefined
}
