/** Board color groups: every level (chapter) gets one, in order. Defined as CSS variables in index.css. */
export const GROUP_COLORS = ['var(--g1)', 'var(--g2)', 'var(--g3)', 'var(--g4)', 'var(--g5)', 'var(--g6)', 'var(--g7)', 'var(--g8)']

export const groupColor = (chapterIndex: number) => GROUP_COLORS[chapterIndex % GROUP_COLORS.length]!
