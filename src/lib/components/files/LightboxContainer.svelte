<script lang="ts">
  import { filePreviewStore, lightboxOpen, currentLightboxFile } from '$lib/stores/filePreview';
  import Lightbox from './Lightbox.svelte';

  function handleClose() {
    filePreviewStore.closeLightbox();
  }

  function handleNext() {
    filePreviewStore.nextImage();
  }

  function handlePrevious() {
    filePreviewStore.previousImage();
  }
</script>

{#if $lightboxOpen && $currentLightboxFile}
  <Lightbox
    file={$currentLightboxFile}
    allFiles={$filePreviewStore.lightbox.allFiles}
    currentIndex={$filePreviewStore.lightbox.currentIndex}
    onClose={handleClose}
    onNext={handleNext}
    onPrevious={handlePrevious}
  />
{/if}