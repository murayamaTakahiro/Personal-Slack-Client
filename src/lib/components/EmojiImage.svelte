<script lang="ts">
  export let emoji: string; // Emoji name without colons
  export let url: string | null = null; // URL for custom emoji or null for Unicode
  export let size: 'small' | 'medium' | 'large' = 'small';
  export let alt: string = emoji;
  
  // Size mappings
  const sizeMap = {
    small: '1.2em',   // Inline with text
    medium: '1.5em',  // Slightly larger
    large: '2em'      // For emoji picker
  };
  
  $: computedSize = sizeMap[size];
  
  // Check if this is a Unicode emoji or custom emoji with URL
  $: isUnicode = !url || !url.startsWith('http');
  
  // Track image load failures
  let imageFailed = false;
  
  function handleImageError() {
    console.warn(`Failed to load emoji image: ${emoji}`);
    imageFailed = true;
  }
  
  // Reset imageFailed when URL changes
  $: if (url) {
    imageFailed = false;
    // Debug logging for specific problematic emoji
    if (emoji.includes('ありがとうございます') || emoji.includes('thankyou')) {
      console.log('[EmojiImage] DEBUG: Rendering emoji:', emoji, '-> URL:', url);
    }
  }
</script>

{#if isUnicode || imageFailed}
  <!-- Unicode emoji or fallback when image fails -->
  <span 
    class="emoji-unicode" 
    style="font-size: {computedSize};"
    title={alt}
    role="img"
    aria-label={alt}
  >
    {url || `:${emoji}:`}
  </span>
{:else}
  <!-- Custom emoji image -->
  <img 
    class="emoji-image" 
    src={url}
    alt={alt}
    title={alt}
    style="width: {computedSize}; height: {computedSize};"
    loading="lazy"
    on:error={handleImageError}
  />
{/if}

<style>
  .emoji-unicode {
    display: inline-block;
    line-height: 1;
    vertical-align: middle;
    font-family: "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", sans-serif;
  }
  
  .emoji-image {
    display: inline-block;
    vertical-align: middle;
    object-fit: contain;
    margin: 0 0.1em;
  }
</style>