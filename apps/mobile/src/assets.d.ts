/** Pictures bundled with the app: Metro hands back an asset number for an Image's source. */
declare module '*.png' {
  const asset: number;
  export default asset;
}

/** Sounds bundled with the app: Metro hands back an asset number, which expo-audio plays. */
declare module '*.wav' {
  const asset: number;
  export default asset;
}
