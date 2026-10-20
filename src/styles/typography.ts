/** Shared by CSS, Ant Design and canvas/editor renderers. Sizes are CSS pixels. */
export const typography = {
  page: 20,
  title: 16,
  section: 14,
  body: 14,
  caption: 12,
  data: 16,
} as const;

export const typographyTheme = {
  fontSize: typography.body,
  fontSizeSM: typography.caption,
  fontSizeLG: typography.body,
  fontSizeXL: typography.title,
  fontSizeHeading1: typography.page,
  fontSizeHeading2: typography.title,
  fontSizeHeading3: typography.section,
  fontSizeHeading4: typography.section,
  fontSizeHeading5: typography.section,
  fontWeightStrong: 600,
  lineHeight: 1.5,
  lineHeightHeading1: 1.4,
  lineHeightHeading2: 1.4,
  lineHeightHeading3: 1.5,
};

export function installTypographyTokens() {
  for (const [name, size] of Object.entries(typography)) {
    document.documentElement.style.setProperty(`--font-${name}`, `${size}px`);
  }
}
