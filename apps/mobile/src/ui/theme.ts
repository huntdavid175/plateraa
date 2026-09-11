/** Counter screens are read at arm's length in a busy kitchen: big text, strong contrast. */
export const colors = {
  ground: '#f5f3ee',
  surface: '#ffffff',
  ink: '#1d1b16',
  muted: '#6b665c',
  line: '#e2ddd2',
  onInk: '#ffffff',
  warningBg: '#fdf0d5',
  warningInk: '#7a4b00',
  dangerBg: '#fbe1dc',
  dangerInk: '#9b1c10',
  infoBg: '#e6eef8',
  infoInk: '#1f3d63',
};

export const space = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

export const radius = 12;

export const text = { small: 15, body: 18, heading: 22, title: 28, key: 30 };

export const plural = (count: number, one: string, many = `${one}s`) =>
  `${count} ${count === 1 ? one : many}`;

export const timeOf = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
