# MacroTrack

A local-first macronutrient tracker with:

- Daily macro logging for protein, carbohydrate, and fat.
- Daily, weekly, and monthly trend averages.
- Adult macro planning based on an estimated resting energy requirement, activity factor, body mass, and training/study focus.
- BMI calculation with explicit screening-only language and different handling for ages 2–19.
- LocalStorage persistence.
- Numeric seed export/import.
- JSON backup/restore.
- Research notes and source links.

## Safety / scope

This version is intentionally focused on fueling, performance, regular meals, and tracking. It does not generate automatic weight-loss or weight-gain calorie deficits/surpluses.

For users under 18, the app does not generate individualized calorie or body-weight-change targets. It keeps tracking and provides general nutrition guidance instead.

The app is educational software, not medical care. A personalized sports or medical nutrition plan should be made with a qualified clinician or registered dietitian.

## Evidence used

- Mifflin-St Jeor predictive equation: https://pubmed.ncbi.nlm.nih.gov/15883556/
- National Academies Dietary Reference Intakes for macronutrients: https://nap.nationalacademies.org/catalog/10490/dietary-reference-intakes-for-energy-carbohydrate-fiber-fat-fatty-acids-cholesterol-protein-and-amino-acids-macronutrients
- Academy of Nutrition and Dietetics / Dietitians of Canada / ACSM sports nutrition position statement: https://pubmed.ncbi.nlm.nih.gov/26920240/
- ISSN protein position stand: https://jissn.biomedcentral.com/articles/10.1186/s12970-017-0177-8
- CDC BMI guidance: https://www.cdc.gov/bmi/

### Privacy

No backend is required. The app stores data in the browser's localStorage. Seed exports are encoded, not encrypted.
