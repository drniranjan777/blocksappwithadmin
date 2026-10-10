/// Demo "gallery" contents. The real app opens the device gallery; the demo
/// offers procedurally generated media so it works offline.
const kDemoPhotoSeeds = <int>[
  1101, 1202, 1303, 1404, 1505, 1606, //
  1707, 1808, 1909, 2010, 2111, 2212,
];

const kDemoVideoSeeds = <int>[
  3101, 3202, 3303, 3404, //
  3505, 3606, 3707, 3808,
];

const kDemoMusic = <String>[
  'Original audio',
  'Tum Hi Ho (instrumental)',
  'Folk beats of Rajasthan',
  'Lo-fi Chennai nights',
  'Dhol remix',
  'Sitar sunrise',
];

String demoPhotoUrl(int seed) => 'demo://art/$seed';
String demoVideoUrl(int seed) => 'demo://reel/$seed';
