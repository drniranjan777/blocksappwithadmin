// India district reference data used by location pickers.
// Static for the demo; a real build loads it from the places service.

class District {
  const District(this.name, this.state);
  final String name;
  final String state;
}

const kDistricts = <District>[
  District('Hyderabad', 'Telangana'),
  District('Warangal', 'Telangana'),
  District('Visakhapatnam', 'Andhra Pradesh'),
  District('Patna', 'Bihar'),
  District('Jaipur', 'Rajasthan'),
  District('Lucknow', 'Uttar Pradesh'),
  District('Varanasi', 'Uttar Pradesh'),
  District('Kochi', 'Kerala'),
  District('Pune', 'Maharashtra'),
  District('Mumbai', 'Maharashtra'),
  District('Chennai', 'Tamil Nadu'),
  District('Coimbatore', 'Tamil Nadu'),
  District('Bengaluru Urban', 'Karnataka'),
  District('Kolkata', 'West Bengal'),
  District('Ahmedabad', 'Gujarat'),
  District('Bhubaneswar', 'Odisha'),
  District('Guwahati', 'Assam'),
  District('Amritsar', 'Punjab'),
  District('Indore', 'Madhya Pradesh'),
  District('Dehradun', 'Uttarakhand'),
];

District districtNamed(String name) => kDistricts.firstWhere(
  (d) => d.name == name,
  orElse: () => kDistricts.first,
);
