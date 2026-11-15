export const JVM_PRESETS = [
  {
    id: 'default',
    labelKey: 'instances.jvmPresetDefault',
    fallbackLabel: 'Default',
    args: '',
  },
  {
    id: 'aikar',
    labelKey: 'instances.jvmPresetAikar',
    fallbackLabel: "Aikar's G1GC",
    args: '-XX:+UseG1GC -XX:+ParallelRefProcEnabled -XX:MaxGCPauseMillis=200 -XX:+UnlockExperimentalVMOptions -XX:+DisableExplicitGC -XX:G1NewSizePercent=30 -XX:G1MaxNewSizePercent=40 -XX:G1HeapRegionSize=8M -XX:G1ReservePercent=20 -XX:G1HeapWastePercent=5 -XX:G1MixedGCCountTarget=4 -XX:InitiatingHeapOccupancyPercent=15 -XX:G1MixedGCLiveThresholdPercent=90 -XX:G1RSetUpdatingPauseTimePercent=5 -XX:SurvivorRatio=32 -XX:+PerfDisableSharedMem',
  },
  {
    id: 'zgc',
    labelKey: 'instances.jvmPresetZgc',
    fallbackLabel: 'Gen ZGC (Java 21+)',
    args: '-XX:+UseZGC -XX:+ZGenerational',
  },
  {
    id: 'lowram',
    labelKey: 'instances.jvmPresetLowRam',
    fallbackLabel: 'Low RAM (<=4G)',
    args: '-XX:+UseG1GC -XX:G1ReservePercent=15 -XX:MaxGCPauseMillis=50',
  },
];
