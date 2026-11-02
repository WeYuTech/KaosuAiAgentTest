const prefix = ':where(#mes-ai-chat-root, #mes-ai-preview-root)'
module.exports = {
  plugins: [
    require('@tailwindcss/postcss')(),
    require('postcss-prefix-selector')({
      prefix,
      transform(_prefix, selector, prefixedSelector) {
        if (selector === ':root' || selector === ':host' || selector === 'html' || selector === 'body') return prefix
        if (selector.includes('#mes-ai-chat-root') || selector.includes('#mes-ai-preview-root')) return selector
        return prefixedSelector
      },
    }),
  ],
}
