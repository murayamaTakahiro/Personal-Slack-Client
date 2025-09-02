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
</script>

{#if isUnicode}
  <!-- Unicode emoji -->
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
    on:error={() => {
      // Fallback to text if image fails to load
      console.warn(`Failed to load emoji image: ${url}`);
    }}
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