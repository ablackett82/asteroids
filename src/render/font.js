// A stroke font in the spirit of the cabinet's: each character a few straight
// lines on a 4 x 6 grid (y down). A character is space-separated strokes, each
// a run of points written as two digits, x then y: "0040" is a line from (0,0)
// to (4,0).

export const FONT = {
  A: '0602204246 0343', B: '06003041423344453606 0333', C: '40000646', D: '06002042442606',
  E: '40000646 0333', F: '400006 0333', G: '400006464323', H: '0006 4046 0343',
  I: '0040 2026 0646', J: '4045361605', K: '0006 400346', L: '000646',
  M: '0600234046', N: '06004640', O: '0040460600', P: '0600404303',
  Q: '004044260600 2446', R: '0600404303 1346', S: '400003434606', T: '0040 2026',
  U: '00064640', V: '002640', W: '0006234640', X: '0046 4006',
  Y: '002340 2326', Z: '00400646',
  0: '0040460600', 1: '2026', 2: '004043030646', 3: '00404606 0343', 4: '000343 4046',
  5: '400003434606', 6: '400006464303', 7: '004046', 8: '0040460600 0343', 9: '4303004046',
  '-': '0343', '.': '2526', ':': '2122 2425', '!': '2024 2526',
};

/** The strokes of a character as arrays of [x, y] points, or [] for a space. */
export const strokes = (ch) => (FONT[ch] ?? '').split(' ').filter(Boolean).map((s) => {
  const pts = [];
  for (let i = 0; i < s.length; i += 2) pts.push([Number(s[i]), Number(s[i + 1])]);
  return pts;
});
