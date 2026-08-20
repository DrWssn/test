/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#102A43',
    tint: '#0C8F84',

    // Core surfaces
    background: '#F4F8F7',
    foreground: '#102A43',

    // Cards / elevated surfaces
    card: '#FFFFFF',
    cardForeground: '#102A43',

    // Primary action color (buttons, links, active states)
    primary: '#0C8F84',
    primaryForeground: '#ffffff',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E2F2EF',
    secondaryForeground: '#145C59',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#E8F0EF',
    mutedForeground: '#61777A',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#D8EFEB',
    accentForeground: '#145C59',

    // Destructive actions (delete, error states)
    destructive: '#C95454',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#D6E3E0',
    input: '#C8DAD6',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 16,
};

export default colors;
