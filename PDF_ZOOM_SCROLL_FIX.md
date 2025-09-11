# PDF Zoom & Scroll Fix

## Problem
PDFs were not creating scrollable content when zoomed. Even at 226% zoom, the PDF would still fit within the viewport with no scrollbars appearing. The canvas was being constrained to the viewport size regardless of the zoom level.

## Root Cause Analysis

### Issue 1: Viewport Constraints Applied During Zoom
- The `maxWidth` and `maxHeight` constraints were being applied even during user-initiated zoom
- Lines 377-396 in PdfRenderer.svelte were constraining the viewport size
- The condition `!initialScaleCalculated` was insufficient to differentiate between initial fit and user zoom

### Issue 2: No Distinction Between Initial Fit and User Zoom
- The component didn't track whether the current scale was from automatic fitting or user interaction
- All scaling operations were treated the same way, applying viewport constraints universally

### Issue 3: Canvas Container CSS
- The canvas container CSS wasn't optimized for allowing growth beyond the viewport
- Missing proper centering and scroll behavior configuration

## Solution

### 1. Track User Zoom State
Added new state variables to distinguish between initial fit and user zoom:
```javascript
let initialScale: number = 1.0; // Store the initial scale for comparison
let isUserZoom = false; // Track if current scale is from user zoom
```

### 2. Conditional Viewport Constraints
Modified the viewport calculation logic to only apply constraints during initial fit:
```javascript
// Determine if this is user zoom (scale changed from initial)
isUserZoom = initialScaleCalculated && Math.abs(renderScale - initialScale) > 0.01;

// Apply viewport constraints only for initial fit, not for user zoom
if ((maxWidth || maxHeight) && !isUserZoom && fitToViewport) {
  // Apply constraints
} else if (isUserZoom && allowScrollOnZoom) {
  // Use scale directly without constraints
}
```

### 3. Update Zoom Functions
Modified zoom functions to properly track user interaction:
```javascript
export function zoomIn() {
  scale = Math.min(scale * 1.2, 5);
  isUserZoom = true; // Mark as user zoom
}

export function resetZoom() {
  scale = initialScaleCalculated ? initialScale : 1.0;
  isUserZoom = false; // Reset to fitted view
}
```

### 4. CSS Improvements
Enhanced the container styles for better scroll handling:
```css
.pdf-renderer {
  overflow: auto;
  scroll-behavior: smooth;
}

.canvas-container {
  display: inline-flex;
  min-width: 100%;
  min-height: 100%;
  margin: auto;
}
```

## Testing

### Test Scenarios
1. **Initial Load**: PDF should fit within viewport, no scrollbars
2. **Zoom In (120%)**: PDF grows, scrollbars may appear depending on content
3. **Zoom In (226%)**: PDF significantly larger, both scrollbars should be visible
4. **Zoom Out**: PDF shrinks, scrollbars disappear when content fits
5. **Reset Zoom**: Returns to initial fitted size

### Test File
Created `test-pdf-scroll.html` to verify the scrolling behavior works correctly with the implemented logic.

## Results

### Before Fix
- PDF always constrained to viewport size
- No scrollbars appeared even at high zoom levels
- Canvas never exceeded container dimensions

### After Fix
- Initial load: PDF fits perfectly within viewport (optimal viewing)
- User zoom: Canvas grows/shrinks freely based on zoom level
- Scrollbars appear automatically when content exceeds viewport
- Smooth scrolling behavior for navigating zoomed content
- Reset zoom returns to fitted view

## Implementation Details

### Files Modified
1. **src/lib/components/files/PdfRenderer.svelte**
   - Added `allowScrollOnZoom` prop (default: true)
   - Added user zoom tracking logic
   - Modified viewport calculation to conditionally apply constraints
   - Updated zoom functions to track user interaction
   - Enhanced CSS for proper scroll behavior

### Key Changes
- Lines 14-15: Added new prop for scroll control
- Lines 26-28: Added state tracking variables
- Lines 251-259: Store initial scale during first calculation
- Lines 373-403: Conditional viewport constraint logic
- Lines 586-608: Updated zoom functions with state tracking
- Lines 653-709: Enhanced CSS for scroll handling

## Benefits
1. **Better User Experience**: Users can zoom in to see details and scroll to navigate
2. **Maintains Optimal Initial View**: PDFs still fit perfectly on initial load
3. **Flexible Zoom Control**: Users can zoom from 50% to 500% with proper scrolling
4. **Consistent Behavior**: Matches expected PDF viewer behavior in other applications