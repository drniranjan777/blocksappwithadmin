export 'package:blocks_app/core/constants/districts.dart';
import 'package:blocks_app/core/errors/app_failure.dart';
import 'package:blocks_app/data/models/app_user.dart';
import 'package:blocks_app/data/models/discovery_models.dart';
import 'package:blocks_app/features/reach/domain/reach_level.dart';

/// Static seed content for the demo. Pure data, no behaviour — everything
/// dynamic (feeds, comments, stats) is generated on demand from these so no
/// screen ever holds a huge list in memory.

const meId = 'me';
const myBusinessId = 'biz_me';

class UserSeed {
  const UserSeed({
    required this.id,
    required this.name,
    required this.handle,
    required this.district,
    required this.bio,
    required this.followers,
    this.verified = false,
    this.verificationType,
    this.level = ReachLevel.district,
    this.following = false,
    this.isBusiness = false,
    this.isPublisher = false,
  });

  final String id;
  final String name;
  final String handle;
  final String district;
  final String bio;
  final int followers;
  final bool verified;
  final VerificationType? verificationType;
  final ReachLevel level;
  final bool following;
  final bool isBusiness;
  final bool isPublisher;
}

/// Index 0 is the signed-in demo creator's counterpart list start; the demo
/// user itself is built separately (see `MockFactory.me`).
const kUserSeeds = <UserSeed>[
  UserSeed(
    id: 'u1',
    name: 'Meera Reddy',
    handle: '@meera.eats',
    district: 'Hyderabad',
    bio: 'Biryani historian. Hyderabad on a plate.',
    followers: 84200,
    verified: true,
    verificationType: VerificationType.creator,
    level: ReachLevel.national,
    following: true,
  ),
  UserSeed(
    id: 'u2',
    name: 'Farhan Qureshi',
    handle: '@farhan.frames',
    district: 'Hyderabad',
    bio: 'Street photographer. Old city, new light.',
    followers: 31200,
    verified: true,
    verificationType: VerificationType.identity,
    level: ReachLevel.state,
    following: true,
  ),
  UserSeed(
    id: 'u3',
    name: 'Tanvi Nair',
    handle: '@tanvi.kochi',
    district: 'Kochi',
    bio: 'Kathakali, kayaks and coconut oil.',
    followers: 120400,
    verified: true,
    verificationType: VerificationType.creator,
    level: ReachLevel.global,
    following: true,
  ),
  UserSeed(
    id: 'u4',
    name: 'Riya Sharma',
    handle: '@riya.patna',
    district: 'Patna',
    bio: 'Litti-chokha evangelist from Bihar.',
    followers: 18900,
    level: ReachLevel.state,
    following: true,
  ),
  UserSeed(
    id: 'u5',
    name: 'Kabir Joshi',
    handle: '@kabir.makes',
    district: 'Pune',
    bio: 'Generative art + chai.',
    followers: 56000,
    verified: true,
    verificationType: VerificationType.identity,
    level: ReachLevel.national,
    following: true,
  ),
  UserSeed(
    id: 'u6',
    name: 'Ananya Iyer',
    handle: '@ananya.carnatic',
    district: 'Chennai',
    bio: 'Carnatic vocalist. Margazhi regular.',
    followers: 40300,
    level: ReachLevel.state,
    following: true,
  ),
  UserSeed(
    id: 'u7',
    name: 'Imran Sheikh',
    handle: '@imran.tech',
    district: 'Hyderabad',
    bio: 'Building in public at HITEC City.',
    followers: 22100,
    level: ReachLevel.state,
    following: true,
  ),
  UserSeed(
    id: 'u8',
    name: 'Karthik Rao',
    handle: '@karthik.cricket',
    district: 'Hyderabad',
    bio: 'Gully cricket to Ranji dreams.',
    followers: 15800,
    level: ReachLevel.district,
    following: true,
  ),
  UserSeed(
    id: 'u9',
    name: 'Debasmita Roy',
    handle: '@debasmita.kolkata',
    district: 'Kolkata',
    bio: 'Adda, art and rosogolla.',
    followers: 29400,
    level: ReachLevel.state,
    following: true,
  ),
  UserSeed(
    id: 'u10',
    name: 'Harpreet Singh',
    handle: '@harpreet.farms',
    district: 'Amritsar',
    bio: 'Fourth-generation wheat farmer.',
    followers: 12700,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u11',
    name: 'Lakshmi Naidu',
    handle: '@lakshmi.vizag',
    district: 'Visakhapatnam',
    bio: 'Beach cleanups and filter coffee.',
    followers: 9800,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u12',
    name: 'Vikram Rathore',
    handle: '@vikram.jaipur',
    district: 'Jaipur',
    bio: 'Block printing, one stamp at a time.',
    followers: 26500,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u13',
    name: 'Zoya Khan',
    handle: '@zoya.lucknow',
    district: 'Lucknow',
    bio: 'Awadhi kitchens and chikankari.',
    followers: 33600,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u14',
    name: 'Nikhil Patel',
    handle: '@nikhil.ahmedabad',
    district: 'Ahmedabad',
    bio: 'Startups, fafda and Sabarmati sunsets.',
    followers: 17400,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u15',
    name: 'Priyanka Das',
    handle: '@priyanka.guwahati',
    district: 'Guwahati',
    bio: 'Tea gardens of Assam.',
    followers: 21800,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u16',
    name: 'Arun Kumar',
    handle: '@arun.blr',
    district: 'Bengaluru Urban',
    bio: 'Cycling the ORR at 5 AM.',
    followers: 19300,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u17',
    name: 'Sneha Kulkarni',
    handle: '@sneha.pune',
    district: 'Pune',
    bio: 'Teaching maths the fun way.',
    followers: 27700,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u18',
    name: 'Divya Menon',
    handle: '@divya.kochi',
    district: 'Kochi',
    bio: 'Backwater homestays.',
    followers: 14100,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u19',
    name: 'Ishaan Verma',
    handle: '@ishaan.indore',
    district: 'Indore',
    bio: 'Poha-jalebi breakfast club.',
    followers: 24900,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u20',
    name: 'Pooja Mishra',
    handle: '@pooja.kashi',
    district: 'Varanasi',
    bio: 'Ghats, ghee and good stories.',
    followers: 35200,
    level: ReachLevel.state,
  ),
  UserSeed(
    id: 'u21',
    name: 'Rahul Bhatt',
    handle: '@rahul.hills',
    district: 'Dehradun',
    bio: 'Trekking the Garhwal Himalaya.',
    followers: 20500,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u22',
    name: 'Sunita Goud',
    handle: '@sunita.warangal',
    district: 'Warangal',
    bio: 'Kakatiya heritage walks.',
    followers: 7600,
    level: ReachLevel.district,
  ),
  UserSeed(
    id: 'u23',
    name: 'Meghdoot News',
    handle: '@meghdoot.news',
    district: 'Lucknow',
    bio: 'Verified regional newsroom.',
    followers: 210000,
    verified: true,
    verificationType: VerificationType.publisher,
    level: ReachLevel.national,
    isPublisher: true,
  ),
  UserSeed(
    id: 'u24',
    name: 'Deccan Daily',
    handle: '@deccan.daily',
    district: 'Hyderabad',
    bio: 'Telangana news, sourced and linked.',
    followers: 98000,
    verified: true,
    verificationType: VerificationType.publisher,
    level: ReachLevel.national,
    isPublisher: true,
  ),
  UserSeed(
    id: 'u25',
    name: 'Charminar Pearls',
    handle: '@charminar.pearls',
    district: 'Hyderabad',
    bio: 'Certified pearls since 1962.',
    followers: 12300,
    verified: true,
    verificationType: VerificationType.business,
    level: ReachLevel.state,
    isBusiness: true,
  ),
  UserSeed(
    id: 'u26',
    name: 'Kerala Spice Co',
    handle: '@kerala.spice',
    district: 'Kochi',
    bio: 'Farm-direct cardamom and pepper.',
    followers: 9100,
    verified: true,
    verificationType: VerificationType.business,
    level: ReachLevel.district,
    isBusiness: true,
  ),
];

UserSeed seedById(String id) {
  for (final u in kUserSeeds) {
    if (u.id == id) return u;
  }
  throw NotFoundFailure('User $id not found');
}

// ------------------------------------------------------------- Templates --

class ContentTheme {
  const ContentTheme(this.category, this.captions, this.tags);
  final ExploreCategory category;
  final List<String> captions;
  final List<String> tags;
}

/// `{d}` is replaced with the post's district name.
const kThemes = <ContentTheme>[
  ContentTheme(
    ExploreCategory.food,
    [
      'Slow-cooked dum biryani in {d}, sealed with dough and patience.',
      'Sunday breakfast crawl through {d} — five stalls, one very full stomach.',
      'Meet the 70-year-old who still grinds masala by hand in {d}.',
    ],
    ['#Foodie', '#{d}Eats', '#StreetFood'],
  ),
  ContentTheme(
    ExploreCategory.travel,
    [
      'Golden hour over {d}. No filter, just a good rooftop.',
      'A weekend in {d}: where to walk, what to eat, where to skip.',
      'Hidden lanes of {d} that no guidebook mentions.',
    ],
    ['#Travel', '#Explore{d}', '#IncredibleIndia'],
  ),
  ContentTheme(
    ExploreCategory.entertainment,
    [
      'Open-mic night in {d} turned into a full-blown singalong.',
      'Behind the scenes of our short film shot entirely around {d}.',
      'Street musicians of {d} deserve a standing ovation.',
    ],
    ['#Music', '#LiveInIndia', '#Creators'],
  ),
  ContentTheme(
    ExploreCategory.technology,
    [
      'Demo day at the {d} startup meetup — three launches, zero slides.',
      'Built a crop-price tracker in a weekend. Open-sourcing it from {d}.',
      'Why local-language AI matters for the next 500 million users.',
    ],
    ['#Tech', '#BuildInIndia', '#Startups'],
  ),
  ContentTheme(
    ExploreCategory.sports,
    [
      'Under-lights cricket at the {d} maidan. Nothing beats it.',
      'District-level kabaddi finals, and what a final it was.',
      'Sunrise run along the {d} lakefront — 10K done.',
    ],
    ['#Cricket', '#Kabaddi', '#Fitness'],
  ),
  ContentTheme(
    ExploreCategory.agriculture,
    [
      'Early monsoon sowing in the fields outside {d}.',
      'Drip irrigation cut our water use by half this season.',
      'Mandi prices today in {d}: what farmers need to know.',
    ],
    ['#Farming', '#Agritech', '#Kisan'],
  ),
  ContentTheme(
    ExploreCategory.fashion,
    [
      'Handloom Friday: a cotton saree from a {d} weaver cooperative.',
      'Block-print co-ords that survive an Indian summer.',
      'Styling one dupatta five ways, {d} edition.',
    ],
    ['#Handloom', '#OOTD', '#VocalForLocal'],
  ),
  ContentTheme(
    ExploreCategory.education,
    [
      'Free maths bootcamp for Class 10 students in {d} starts Monday.',
      'How I cracked my exam with 3 hours of study a day.',
      'Library hours extended for exam season in {d}. Share with a student.',
    ],
    ['#Education', '#StudyWithMe', '#Scholarship'],
  ),
  ContentTheme(
    ExploreCategory.business,
    [
      'Our small bakery just crossed 1,000 happy customers in {d}!',
      'How a local kirana store went digital in one month.',
      'Festive offers are live in {d}. Support small businesses.',
    ],
    ['#SmallBusiness', '#LocalFirst', '#MSME'],
  ),
  ContentTheme(
    ExploreCategory.jobs,
    [
      'Hiring: 12 openings for freshers at {d} companies this week.',
      'Walk-in interview drive in {d} — details below.',
      'Resume tips from a recruiter who reads 200 a day.',
    ],
    ['#Jobs', '#Hiring', '#Careers'],
  ),
  ContentTheme(
    ExploreCategory.events,
    [
      'Two days to the {d} cultural festival. Lineup inside.',
      'Book fair opens this weekend in {d}. See you there!',
      'Diwali mela in {d}: lamps, sweets and live folk music.',
    ],
    ['#Festival', '#Events', '#Mela'],
  ),
  ContentTheme(
    ExploreCategory.local,
    [
      'Pothole-free in 48 hours: how {d} residents got their road fixed.',
      'Lake cleanup drive in {d} this Sunday — bring gloves.',
      'Your ward, your voice: community meeting notes from {d}.',
    ],
    ['#Community', '#MyCity', '#{d}'],
  ),
  ContentTheme(
    ExploreCategory.news,
    [
      'Civic update: new bus corridor approved for {d}.',
      'Weather alert for {d}: heavy rain expected tonight.',
      'Metro phase 2 timeline released for {d}, officials confirm.',
    ],
    ['#News', '#CivicUpdate', '#{d}'],
  ),
];

const kMusicTitles = <String>[
  'Original audio',
  'Tum Hi Ho (instrumental)',
  'Folk beats of Rajasthan',
  'Lo-fi Chennai nights',
  'Dhol remix',
  'Sitar sunrise',
];

const kCommentTexts = <String>[
  'This is so good!',
  'Where exactly is this? Going this weekend.',
  'Pure gold, keep posting.',
  'Mera ghar yaad aa gaya.',
  'Shared with my whole family.',
  'Underrated creator. Followed!',
  'Hyderabad represent!',
  'Can you post the full recipe?',
  'Proud of our district.',
  'This deserves to reach the whole country.',
  'Wah! Kya baat hai.',
  'Saved for later.',
];

const kInterests = <String>[
  'Food lovers',
  'Travel',
  'Tech',
  'Fashion',
  'Students',
  'Families',
  'Fitness',
  'Music',
  'Local shoppers',
];
