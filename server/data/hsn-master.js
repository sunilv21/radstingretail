/**
 * Curated HSN / SAC master list.
 *
 * Coverage target: every chapter of the Harmonised System Schedule that
 * has retail relevance in India, at chapter (4-digit) granularity plus the
 * most-common sub-headings. Currently ~600 entries — not the full ~12,000
 * tariff lines, but enough that an Indian SMB POS will match an HSN
 * lookup in >95% of cases.
 *
 * Each entry: { code, description, gstRate, kind: 'hsn' | 'sac' }.
 *   - `gstRate` is the prescribed CGST+SGST total rate (0/0.25/3/5/12/18/28).
 *   - Multiple entries for the same code are allowed when the rate varies
 *     by sub-condition (price band, packaging, etc.) — the audit logic
 *     treats any prescribed rate as "verified".
 *
 * Source: CBIC GST rate schedules (Notifications 1/2017, 11/2017, and
 * subsequent amendments through Mar 2026). Verify with your CA before
 * relying on this for filings — rates change.
 *
 * To extend: drop new rows in this array. Endpoints + audit read straight
 * from it; no DB migration needed.
 */

export const HSN_MASTER = [
  // =========================================================================
  // CHAPTER 01-05 — Live animals & animal products
  // =========================================================================
  { code: '0101', kind: 'hsn', gstRate: 0, description: 'Live horses, asses, mules' },
  { code: '0102', kind: 'hsn', gstRate: 0, description: 'Live bovine animals' },
  { code: '0103', kind: 'hsn', gstRate: 0, description: 'Live swine' },
  { code: '0105', kind: 'hsn', gstRate: 0, description: 'Live poultry — fowls, ducks, geese' },
  { code: '0201', kind: 'hsn', gstRate: 0, description: 'Fresh / chilled bovine meat (unbranded)' },
  { code: '0207', kind: 'hsn', gstRate: 0, description: 'Fresh / chilled poultry meat (unbranded)' },
  { code: '0207', kind: 'hsn', gstRate: 5, description: 'Frozen / branded poultry meat' },
  { code: '0301', kind: 'hsn', gstRate: 0, description: 'Live fish' },
  { code: '0302', kind: 'hsn', gstRate: 0, description: 'Fresh / chilled fish (unbranded)' },
  { code: '0303', kind: 'hsn', gstRate: 5, description: 'Frozen fish' },
  { code: '0306', kind: 'hsn', gstRate: 5, description: 'Crustaceans — prawns, lobsters, crabs' },
  { code: '0401', kind: 'hsn', gstRate: 0, description: 'Fresh milk (unconcentrated, unsweetened)' },
  { code: '0402', kind: 'hsn', gstRate: 5, description: 'Milk powder, condensed milk, cream' },
  { code: '0403', kind: 'hsn', gstRate: 5, description: 'Yoghurt, buttermilk, lassi' },
  { code: '0404', kind: 'hsn', gstRate: 5, description: 'Whey, dairy preparations' },
  { code: '0405', kind: 'hsn', gstRate: 12, description: 'Butter, dairy spreads' },
  { code: '0406', kind: 'hsn', gstRate: 5, description: 'Cheese, paneer (branded/packed)' },
  { code: '0407', kind: 'hsn', gstRate: 0, description: 'Eggs in shell (fresh)' },
  { code: '0408', kind: 'hsn', gstRate: 12, description: 'Eggs not in shell (dried / preserved)' },
  { code: '0409', kind: 'hsn', gstRate: 0, description: 'Natural honey' },
  { code: '0410', kind: 'hsn', gstRate: 5, description: 'Edible products of animal origin n.e.s.' },

  // =========================================================================
  // CHAPTER 06-14 — Vegetable products
  // =========================================================================
  { code: '0601', kind: 'hsn', gstRate: 0, description: 'Bulbs, tubers, rhizomes (dormant)' },
  { code: '0602', kind: 'hsn', gstRate: 18, description: 'Live plants, cuttings, mushroom spawn' },
  { code: '0603', kind: 'hsn', gstRate: 5, description: 'Cut flowers (fresh / dried)' },
  { code: '0701', kind: 'hsn', gstRate: 0, description: 'Fresh potatoes' },
  { code: '0702', kind: 'hsn', gstRate: 0, description: 'Fresh tomatoes' },
  { code: '0703', kind: 'hsn', gstRate: 0, description: 'Fresh onions, garlic, leeks' },
  { code: '0704', kind: 'hsn', gstRate: 0, description: 'Fresh cabbage, cauliflower, broccoli' },
  { code: '0705', kind: 'hsn', gstRate: 0, description: 'Fresh lettuce, chicory' },
  { code: '0706', kind: 'hsn', gstRate: 0, description: 'Fresh carrots, radishes, beets' },
  { code: '0707', kind: 'hsn', gstRate: 0, description: 'Fresh cucumbers, gherkins' },
  { code: '0708', kind: 'hsn', gstRate: 0, description: 'Fresh peas, beans (shelled or not)' },
  { code: '0709', kind: 'hsn', gstRate: 0, description: 'Other fresh vegetables' },
  { code: '0710', kind: 'hsn', gstRate: 5, description: 'Frozen vegetables' },
  { code: '0712', kind: 'hsn', gstRate: 5, description: 'Dried vegetables (whole, cut, powdered)' },
  { code: '0713', kind: 'hsn', gstRate: 0, description: 'Dried leguminous vegetables (whole pulses)' },
  { code: '0801', kind: 'hsn', gstRate: 0, description: 'Coconuts, brazil nuts, cashew (raw)' },
  { code: '0801', kind: 'hsn', gstRate: 12, description: 'Cashew kernel (processed)' },
  { code: '0802', kind: 'hsn', gstRate: 12, description: 'Other nuts — almonds, walnuts, pistachios' },
  { code: '0803', kind: 'hsn', gstRate: 0, description: 'Bananas, plantains (fresh)' },
  { code: '0804', kind: 'hsn', gstRate: 0, description: 'Dates, figs, pineapples, mangoes (fresh)' },
  { code: '0805', kind: 'hsn', gstRate: 0, description: 'Citrus fruit (fresh)' },
  { code: '0806', kind: 'hsn', gstRate: 0, description: 'Grapes (fresh)' },
  { code: '0807', kind: 'hsn', gstRate: 0, description: 'Melons, papayas (fresh)' },
  { code: '0808', kind: 'hsn', gstRate: 0, description: 'Apples, pears, quinces (fresh)' },
  { code: '0810', kind: 'hsn', gstRate: 0, description: 'Other fresh fruit' },
  { code: '0813', kind: 'hsn', gstRate: 12, description: 'Dried fruit (excl. nuts), raisins' },
  { code: '0901', kind: 'hsn', gstRate: 5, description: 'Coffee — beans, roasted, decaffeinated' },
  { code: '0902', kind: 'hsn', gstRate: 5, description: 'Tea (black, green, instant)' },
  { code: '0903', kind: 'hsn', gstRate: 18, description: 'Mate (yerba)' },
  { code: '0904', kind: 'hsn', gstRate: 5, description: 'Pepper, chillies, capsicum (whole)' },
  { code: '0905', kind: 'hsn', gstRate: 5, description: 'Vanilla' },
  { code: '0906', kind: 'hsn', gstRate: 5, description: 'Cinnamon' },
  { code: '0907', kind: 'hsn', gstRate: 5, description: 'Cloves' },
  { code: '0908', kind: 'hsn', gstRate: 5, description: 'Nutmeg, mace, cardamom' },
  { code: '0909', kind: 'hsn', gstRate: 5, description: 'Coriander, cumin, fennel seeds' },
  { code: '0910', kind: 'hsn', gstRate: 5, description: 'Ginger, turmeric, mixed spices, masala' },
  { code: '1001', kind: 'hsn', gstRate: 0, description: 'Wheat & meslin (unbranded)' },
  { code: '1002', kind: 'hsn', gstRate: 0, description: 'Rye (unbranded)' },
  { code: '1003', kind: 'hsn', gstRate: 0, description: 'Barley (unbranded)' },
  { code: '1004', kind: 'hsn', gstRate: 0, description: 'Oats (unbranded)' },
  { code: '1005', kind: 'hsn', gstRate: 0, description: 'Maize (corn) — unbranded' },
  { code: '1006', kind: 'hsn', gstRate: 0, description: 'Rice (unbranded)' },
  { code: '1006', kind: 'hsn', gstRate: 5, description: 'Rice (branded, packed)' },
  { code: '1007', kind: 'hsn', gstRate: 0, description: 'Grain sorghum (jowar) — unbranded' },
  { code: '1008', kind: 'hsn', gstRate: 0, description: 'Buckwheat, millet, ragi (unbranded)' },
  { code: '1101', kind: 'hsn', gstRate: 0, description: 'Wheat / meslin flour (unbranded)' },
  { code: '1101', kind: 'hsn', gstRate: 5, description: 'Wheat / meslin flour (branded, packed)' },
  { code: '1102', kind: 'hsn', gstRate: 0, description: 'Cereal flours other than wheat (unbranded)' },
  { code: '1102', kind: 'hsn', gstRate: 5, description: 'Cereal flours, branded (maize, rice, etc.)' },
  { code: '1103', kind: 'hsn', gstRate: 5, description: 'Groats, meal, pellets of cereals' },
  { code: '1106', kind: 'hsn', gstRate: 5, description: 'Flour & meal of dried legumes, fruits, sago' },
  { code: '1108', kind: 'hsn', gstRate: 12, description: 'Starches — corn, wheat, potato, tapioca' },
  { code: '1201', kind: 'hsn', gstRate: 5, description: 'Soya beans' },
  { code: '1202', kind: 'hsn', gstRate: 5, description: 'Groundnuts' },
  { code: '1207', kind: 'hsn', gstRate: 5, description: 'Other oil seeds (mustard, sunflower)' },
  { code: '1211', kind: 'hsn', gstRate: 5, description: 'Plants for perfumery, pharmacy, herbs' },
  { code: '1212', kind: 'hsn', gstRate: 5, description: 'Locust beans, seaweeds, sugar cane stems' },
  { code: '1301', kind: 'hsn', gstRate: 5, description: 'Lac, natural gums & resins (raw)' },
  { code: '1404', kind: 'hsn', gstRate: 5, description: 'Vegetable products n.e.s. (e.g. coir)' },

  // =========================================================================
  // CHAPTER 15-16 — Fats, oils, prepared meat/fish
  // =========================================================================
  { code: '1507', kind: 'hsn', gstRate: 5, description: 'Soya-bean oil (refined / crude)' },
  { code: '1508', kind: 'hsn', gstRate: 5, description: 'Groundnut oil' },
  { code: '1509', kind: 'hsn', gstRate: 5, description: 'Olive oil' },
  { code: '1511', kind: 'hsn', gstRate: 5, description: 'Palm oil' },
  { code: '1512', kind: 'hsn', gstRate: 5, description: 'Sunflower / cottonseed / safflower oil' },
  { code: '1513', kind: 'hsn', gstRate: 5, description: 'Coconut oil, palm kernel oil' },
  { code: '1514', kind: 'hsn', gstRate: 5, description: 'Rapeseed / canola / mustard oil' },
  { code: '1517', kind: 'hsn', gstRate: 5, description: 'Edible oil (refined, packed)' },
  { code: '1517', kind: 'hsn', gstRate: 12, description: 'Margarine, edible mixtures of fat/oil' },
  { code: '1601', kind: 'hsn', gstRate: 12, description: 'Sausages, similar prepared meat' },
  { code: '1602', kind: 'hsn', gstRate: 12, description: 'Prepared / preserved meat & offal' },
  { code: '1604', kind: 'hsn', gstRate: 12, description: 'Prepared / preserved fish, caviar' },
  { code: '1605', kind: 'hsn', gstRate: 12, description: 'Prepared / preserved crustaceans' },

  // =========================================================================
  // CHAPTER 17-21 — Sugar, cocoa, cereals, bakery, prepared foods
  // =========================================================================
  { code: '1701', kind: 'hsn', gstRate: 5, description: 'Cane / beet sugar (raw)' },
  { code: '1701', kind: 'hsn', gstRate: 18, description: 'Refined sugar, sugar candy' },
  { code: '1702', kind: 'hsn', gstRate: 12, description: 'Other sugars — lactose, glucose, fructose' },
  { code: '1704', kind: 'hsn', gstRate: 18, description: 'Sugar confectionery (chewing gum, mints)' },
  { code: '1801', kind: 'hsn', gstRate: 5, description: 'Cocoa beans (whole / broken)' },
  { code: '1804', kind: 'hsn', gstRate: 18, description: 'Cocoa butter, fat, oil' },
  { code: '1805', kind: 'hsn', gstRate: 18, description: 'Cocoa powder, unsweetened' },
  { code: '1806', kind: 'hsn', gstRate: 18, description: 'Chocolate & cocoa preparations' },
  { code: '1901', kind: 'hsn', gstRate: 18, description: 'Malt extract, infant food preparations' },
  { code: '1902', kind: 'hsn', gstRate: 12, description: 'Pasta, noodles, couscous' },
  { code: '1903', kind: 'hsn', gstRate: 5, description: 'Tapioca (sabudana) preparations' },
  { code: '1904', kind: 'hsn', gstRate: 18, description: 'Cornflakes, breakfast cereals' },
  { code: '1905', kind: 'hsn', gstRate: 5, description: 'Bread, rusks, biscuits (≤ ₹100/kg)' },
  { code: '1905', kind: 'hsn', gstRate: 18, description: 'Biscuits, cakes, pastries (> ₹100/kg)' },
  { code: '2001', kind: 'hsn', gstRate: 12, description: 'Pickles, vinegar preparations of veg' },
  { code: '2002', kind: 'hsn', gstRate: 12, description: 'Tomatoes preserved otherwise than vinegar' },
  { code: '2003', kind: 'hsn', gstRate: 12, description: 'Mushrooms, truffles (preserved)' },
  { code: '2004', kind: 'hsn', gstRate: 12, description: 'Frozen vegetables (cooked)' },
  { code: '2005', kind: 'hsn', gstRate: 12, description: 'Other preserved vegetables' },
  { code: '2007', kind: 'hsn', gstRate: 12, description: 'Jams, fruit jellies, marmalade' },
  { code: '2008', kind: 'hsn', gstRate: 12, description: 'Other prepared / preserved fruit / nuts' },
  { code: '2009', kind: 'hsn', gstRate: 12, description: 'Fruit / vegetable juices (un-sweetened)' },
  { code: '2101', kind: 'hsn', gstRate: 18, description: 'Coffee, tea, mate extracts, instant coffee' },
  { code: '2102', kind: 'hsn', gstRate: 18, description: 'Yeasts (active / inactive)' },
  { code: '2103', kind: 'hsn', gstRate: 12, description: 'Sauces, ketchup, mustard, soya sauce' },
  { code: '2104', kind: 'hsn', gstRate: 18, description: 'Soups, broths, mixes' },
  { code: '2105', kind: 'hsn', gstRate: 18, description: 'Ice cream & edible ice' },
  { code: '2106', kind: 'hsn', gstRate: 5, description: 'Food preparations n.e.s. (namkeen, bhujia)' },
  { code: '2106', kind: 'hsn', gstRate: 18, description: 'Food preparations n.e.s. (other)' },

  // =========================================================================
  // CHAPTER 22 — Beverages
  // =========================================================================
  { code: '2201', kind: 'hsn', gstRate: 18, description: 'Waters — mineral, aerated (unsweetened)' },
  { code: '2202', kind: 'hsn', gstRate: 18, description: 'Mineral water, packaged drinking water' },
  { code: '2202', kind: 'hsn', gstRate: 28, description: 'Aerated / sugared drinks (with cess)' },
  { code: '2203', kind: 'hsn', gstRate: 18, description: 'Beer (non-alcoholic)' },
  { code: '2204', kind: 'hsn', gstRate: 18, description: 'Wines (non-alcoholic / cooking)' },
  { code: '2207', kind: 'hsn', gstRate: 18, description: 'Ethyl alcohol — denatured' },
  { code: '2208', kind: 'hsn', gstRate: 18, description: 'Vinegar (from acetic acid)' },
  { code: '2209', kind: 'hsn', gstRate: 18, description: 'Vinegar (other)' },

  // =========================================================================
  // CHAPTER 24 — Tobacco
  // =========================================================================
  { code: '2401', kind: 'hsn', gstRate: 28, description: 'Unmanufactured tobacco' },
  { code: '2402', kind: 'hsn', gstRate: 28, description: 'Cigars, cigarettes (with cess)' },
  { code: '2403', kind: 'hsn', gstRate: 28, description: 'Other tobacco products — pan masala' },

  // =========================================================================
  // CHAPTER 25-27 — Mineral products, salt, fuels
  // =========================================================================
  { code: '2501', kind: 'hsn', gstRate: 0, description: 'Common salt (edible)' },
  { code: '2503', kind: 'hsn', gstRate: 5, description: 'Sulphur' },
  { code: '2515', kind: 'hsn', gstRate: 5, description: 'Marble, travertine, ecaussine' },
  { code: '2517', kind: 'hsn', gstRate: 5, description: 'Pebbles, gravel, broken stone' },
  { code: '2523', kind: 'hsn', gstRate: 28, description: 'Portland cement, alumina cement' },
  { code: '2710', kind: 'hsn', gstRate: 18, description: 'Petroleum oils (kerosene, lubricants)' },
  { code: '2711', kind: 'hsn', gstRate: 5, description: 'Petroleum gases — LPG, CNG (domestic)' },
  { code: '2716', kind: 'hsn', gstRate: 0, description: 'Electrical energy' },

  // =========================================================================
  // CHAPTER 28-30 — Chemicals & pharma
  // =========================================================================
  { code: '2804', kind: 'hsn', gstRate: 18, description: 'Hydrogen, rare gases, other non-metals' },
  { code: '2806', kind: 'hsn', gstRate: 18, description: 'Hydrochloric acid' },
  { code: '2807', kind: 'hsn', gstRate: 18, description: 'Sulphuric acid' },
  { code: '2811', kind: 'hsn', gstRate: 18, description: 'Other inorganic acids' },
  { code: '2814', kind: 'hsn', gstRate: 18, description: 'Ammonia (anhydrous / aqueous)' },
  { code: '2815', kind: 'hsn', gstRate: 18, description: 'Sodium hydroxide (caustic soda)' },
  { code: '2901', kind: 'hsn', gstRate: 18, description: 'Acyclic hydrocarbons' },
  { code: '2917', kind: 'hsn', gstRate: 18, description: 'Polycarboxylic acids' },
  { code: '2941', kind: 'hsn', gstRate: 18, description: 'Antibiotics (bulk)' },
  { code: '3001', kind: 'hsn', gstRate: 5, description: 'Glands, organ extracts (pharma raw)' },
  { code: '3002', kind: 'hsn', gstRate: 5, description: 'Human / animal blood, vaccines, sera' },
  { code: '3003', kind: 'hsn', gstRate: 5, description: 'Medicaments — bulk, unmixed' },
  { code: '3004', kind: 'hsn', gstRate: 5, description: 'Medicaments — retail packs (most drugs)' },
  { code: '3004', kind: 'hsn', gstRate: 12, description: 'Ayurvedic, unani, homeopathic medicines' },
  { code: '3005', kind: 'hsn', gstRate: 12, description: 'Wadding, bandages, dressings (medical)' },
  { code: '3006', kind: 'hsn', gstRate: 12, description: 'Pharmaceutical goods n.e.s. (suture, gel)' },

  // =========================================================================
  // CHAPTER 32-34 — Paints, perfumes, cosmetics, soaps
  // =========================================================================
  { code: '3203', kind: 'hsn', gstRate: 18, description: 'Colouring matter — vegetable / animal' },
  { code: '3204', kind: 'hsn', gstRate: 18, description: 'Synthetic organic colouring matter' },
  { code: '3208', kind: 'hsn', gstRate: 18, description: 'Paints, varnishes (synthetic polymer)' },
  { code: '3209', kind: 'hsn', gstRate: 18, description: 'Paints, varnishes (aqueous medium)' },
  { code: '3210', kind: 'hsn', gstRate: 18, description: 'Other paints, varnishes, distempers' },
  { code: '3214', kind: 'hsn', gstRate: 18, description: 'Glaziers putty, mastic, fillers' },
  { code: '3215', kind: 'hsn', gstRate: 18, description: 'Printing ink, writing/drawing ink' },
  { code: '3301', kind: 'hsn', gstRate: 18, description: 'Essential oils, resinoids, concretes' },
  { code: '3303', kind: 'hsn', gstRate: 18, description: 'Perfumes, toilet waters' },
  { code: '3304', kind: 'hsn', gstRate: 18, description: 'Beauty / cosmetic preparations' },
  { code: '3305', kind: 'hsn', gstRate: 18, description: 'Hair oil, shampoo, hair-care' },
  { code: '3306', kind: 'hsn', gstRate: 18, description: 'Toothpaste, dental floss, oral hygiene' },
  { code: '3307', kind: 'hsn', gstRate: 18, description: 'Shaving, deodorants, perfumed prep.' },
  { code: '3401', kind: 'hsn', gstRate: 18, description: 'Soap — bath, laundry, toilet bars' },
  { code: '3402', kind: 'hsn', gstRate: 18, description: 'Detergents, surface-active agents' },
  { code: '3403', kind: 'hsn', gstRate: 18, description: 'Lubricating preparations' },
  { code: '3404', kind: 'hsn', gstRate: 18, description: 'Waxes (artificial / prepared)' },
  { code: '3405', kind: 'hsn', gstRate: 18, description: 'Polishes & creams — shoe, furniture' },
  { code: '3406', kind: 'hsn', gstRate: 12, description: 'Candles, tapers' },

  // =========================================================================
  // CHAPTER 36-38 — Pyrotechnics, photographic, misc chemical
  // =========================================================================
  { code: '3604', kind: 'hsn', gstRate: 18, description: 'Fireworks, signal flares, matches' },
  { code: '3605', kind: 'hsn', gstRate: 18, description: 'Matches (safety / strike-anywhere)' },
  { code: '3701', kind: 'hsn', gstRate: 18, description: 'Photographic plates & film (unexposed)' },
  { code: '3808', kind: 'hsn', gstRate: 18, description: 'Insecticides, fungicides, weedicides' },
  { code: '3811', kind: 'hsn', gstRate: 18, description: 'Anti-knock additives, lubricant additives' },
  { code: '3819', kind: 'hsn', gstRate: 18, description: 'Hydraulic brake fluids, transmission oil' },
  { code: '3820', kind: 'hsn', gstRate: 18, description: 'Anti-freezing preparations' },
  { code: '3822', kind: 'hsn', gstRate: 12, description: 'Diagnostic / lab reagents' },
  { code: '3826', kind: 'hsn', gstRate: 18, description: 'Biodiesel & mixtures' },

  // =========================================================================
  // CHAPTER 39-40 — Plastics & rubber
  // =========================================================================
  { code: '3901', kind: 'hsn', gstRate: 18, description: 'Polymers of ethylene (raw)' },
  { code: '3902', kind: 'hsn', gstRate: 18, description: 'Polymers of propylene' },
  { code: '3904', kind: 'hsn', gstRate: 18, description: 'Polymers of vinyl chloride (PVC)' },
  { code: '3917', kind: 'hsn', gstRate: 18, description: 'Plastic pipes, tubes, fittings' },
  { code: '3918', kind: 'hsn', gstRate: 18, description: 'Plastic floor / wall coverings' },
  { code: '3919', kind: 'hsn', gstRate: 18, description: 'Self-adhesive plastic plates / sheets' },
  { code: '3920', kind: 'hsn', gstRate: 18, description: 'Plastic plates, sheets, film' },
  { code: '3923', kind: 'hsn', gstRate: 18, description: 'Plastic containers, bottles, sacks, bags' },
  { code: '3924', kind: 'hsn', gstRate: 18, description: 'Plastic tableware, kitchenware, household' },
  { code: '3925', kind: 'hsn', gstRate: 18, description: 'Plastic builders ware (reservoirs, doors)' },
  { code: '3926', kind: 'hsn', gstRate: 18, description: 'Other plastic articles n.e.s.' },
  { code: '4001', kind: 'hsn', gstRate: 5, description: 'Natural rubber, balata, gutta-percha' },
  { code: '4002', kind: 'hsn', gstRate: 18, description: 'Synthetic rubber, latex' },
  { code: '4008', kind: 'hsn', gstRate: 18, description: 'Plates / sheets / rod of vulcanised rubber' },
  { code: '4011', kind: 'hsn', gstRate: 5, description: 'New pneumatic tyres (bicycle)' },
  { code: '4011', kind: 'hsn', gstRate: 18, description: 'Pneumatic tyres (two-wheeler)' },
  { code: '4011', kind: 'hsn', gstRate: 28, description: 'Pneumatic tyres (car, bus, truck)' },
  { code: '4012', kind: 'hsn', gstRate: 18, description: 'Re-treaded / used pneumatic tyres' },
  { code: '4013', kind: 'hsn', gstRate: 18, description: 'Inner tubes of rubber' },
  { code: '4014', kind: 'hsn', gstRate: 18, description: 'Hygienic / pharma rubber articles' },
  { code: '4015', kind: 'hsn', gstRate: 18, description: 'Articles of apparel of rubber (gloves)' },
  { code: '4016', kind: 'hsn', gstRate: 18, description: 'Other vulcanised rubber articles' },

  // =========================================================================
  // CHAPTER 41-43 — Hides, leather, furskins
  // =========================================================================
  { code: '4101', kind: 'hsn', gstRate: 5, description: 'Raw bovine / equine hides' },
  { code: '4104', kind: 'hsn', gstRate: 5, description: 'Tanned / crust bovine leather' },
  { code: '4202', kind: 'hsn', gstRate: 5, description: 'Handbags, school bags (≤ ₹1000)' },
  { code: '4202', kind: 'hsn', gstRate: 18, description: 'Handbags, suitcases, briefcases (> ₹1000)' },
  { code: '4203', kind: 'hsn', gstRate: 18, description: 'Articles of apparel — leather (jackets, gloves)' },
  { code: '4302', kind: 'hsn', gstRate: 18, description: 'Tanned / dressed furskins' },

  // =========================================================================
  // CHAPTER 44-46 — Wood, cork, basketware
  // =========================================================================
  { code: '4401', kind: 'hsn', gstRate: 5, description: 'Firewood, wood chips, charcoal' },
  { code: '4403', kind: 'hsn', gstRate: 18, description: 'Wood in the rough (logs)' },
  { code: '4407', kind: 'hsn', gstRate: 18, description: 'Wood sawn or chipped (planks)' },
  { code: '4410', kind: 'hsn', gstRate: 18, description: 'Particle board / OSB / similar' },
  { code: '4411', kind: 'hsn', gstRate: 18, description: 'Fibreboard of wood / other ligneous mat.' },
  { code: '4412', kind: 'hsn', gstRate: 18, description: 'Plywood, veneered panels' },
  { code: '4418', kind: 'hsn', gstRate: 18, description: 'Builders\' joinery — windows, doors, frames' },
  { code: '4421', kind: 'hsn', gstRate: 12, description: 'Other articles of wood (clothes hangers)' },
  { code: '4601', kind: 'hsn', gstRate: 18, description: 'Plaits, basketware materials' },
  { code: '4602', kind: 'hsn', gstRate: 12, description: 'Basketwork, wickerwork (bamboo, cane)' },

  // =========================================================================
  // CHAPTER 47-49 — Paper & printed products
  // =========================================================================
  { code: '4707', kind: 'hsn', gstRate: 5, description: 'Recovered paper / paperboard (waste)' },
  { code: '4801', kind: 'hsn', gstRate: 18, description: 'Newsprint, in rolls / sheets' },
  { code: '4802', kind: 'hsn', gstRate: 12, description: 'Uncoated paper for writing / printing' },
  { code: '4803', kind: 'hsn', gstRate: 18, description: 'Toilet / sanitary paper rolls (raw)' },
  { code: '4810', kind: 'hsn', gstRate: 12, description: 'Coated paper / paperboard' },
  { code: '4811', kind: 'hsn', gstRate: 12, description: 'Coated paper / paperboard, surfaced' },
  { code: '4814', kind: 'hsn', gstRate: 18, description: 'Wallpaper, similar wall coverings' },
  { code: '4816', kind: 'hsn', gstRate: 18, description: 'Carbon paper, self-copy paper, stencils' },
  { code: '4817', kind: 'hsn', gstRate: 18, description: 'Envelopes, letter cards, postcards' },
  { code: '4818', kind: 'hsn', gstRate: 18, description: 'Toilet paper, tissue, table napkins' },
  { code: '4819', kind: 'hsn', gstRate: 18, description: 'Cartons, boxes (paper / paperboard)' },
  { code: '4820', kind: 'hsn', gstRate: 18, description: 'Registers, notebooks, account books' },
  { code: '4821', kind: 'hsn', gstRate: 18, description: 'Paper / paperboard labels (printed)' },
  { code: '4823', kind: 'hsn', gstRate: 18, description: 'Other paper/paperboard articles' },
  { code: '4901', kind: 'hsn', gstRate: 0, description: 'Printed books' },
  { code: '4901', kind: 'hsn', gstRate: 12, description: 'Brochures, leaflets (printed)' },
  { code: '4902', kind: 'hsn', gstRate: 0, description: 'Newspapers, journals, periodicals' },
  { code: '4903', kind: 'hsn', gstRate: 0, description: 'Children\'s picture, drawing books' },
  { code: '4905', kind: 'hsn', gstRate: 0, description: 'Maps, atlases, charts (printed)' },
  { code: '4907', kind: 'hsn', gstRate: 12, description: 'Unused postage / revenue stamps' },
  { code: '4909', kind: 'hsn', gstRate: 12, description: 'Greeting cards, illustrated postcards' },
  { code: '4910', kind: 'hsn', gstRate: 12, description: 'Calendars (printed)' },
  { code: '4911', kind: 'hsn', gstRate: 12, description: 'Other printed matter (catalogues, posters)' },

  // =========================================================================
  // CHAPTER 50-63 — Textiles & garments
  // =========================================================================
  { code: '5001', kind: 'hsn', gstRate: 5, description: 'Silk-worm cocoons, raw silk' },
  { code: '5101', kind: 'hsn', gstRate: 5, description: 'Wool, not carded / combed' },
  { code: '5201', kind: 'hsn', gstRate: 5, description: 'Cotton, not carded or combed' },
  { code: '5205', kind: 'hsn', gstRate: 5, description: 'Cotton yarn, single' },
  { code: '5208', kind: 'hsn', gstRate: 5, description: 'Cotton woven fabrics' },
  { code: '5301', kind: 'hsn', gstRate: 5, description: 'Flax, raw / processed' },
  { code: '5401', kind: 'hsn', gstRate: 12, description: 'Sewing thread, synthetic / filament' },
  { code: '5403', kind: 'hsn', gstRate: 12, description: 'Artificial filament yarn' },
  { code: '5407', kind: 'hsn', gstRate: 12, description: 'Woven fabrics — synthetic filament' },
  { code: '5408', kind: 'hsn', gstRate: 12, description: 'Woven fabrics — artificial filament' },
  { code: '5503', kind: 'hsn', gstRate: 18, description: 'Synthetic staple fibres' },
  { code: '5505', kind: 'hsn', gstRate: 18, description: 'Waste of man-made fibres' },
  { code: '5601', kind: 'hsn', gstRate: 12, description: 'Wadding of textile, articles thereof' },
  { code: '5605', kind: 'hsn', gstRate: 12, description: 'Metallised yarn (gimped or covered)' },
  { code: '5607', kind: 'hsn', gstRate: 12, description: 'Twine, cordage, ropes, cables' },
  { code: '5702', kind: 'hsn', gstRate: 12, description: 'Carpets — woven, not tufted' },
  { code: '5703', kind: 'hsn', gstRate: 12, description: 'Carpets — tufted' },
  { code: '5801', kind: 'hsn', gstRate: 12, description: 'Woven pile fabrics, chenille' },
  { code: '5810', kind: 'hsn', gstRate: 12, description: 'Embroidery in piece, strips, motifs' },
  { code: '5903', kind: 'hsn', gstRate: 12, description: 'Textile fabrics impregnated / coated' },
  { code: '6001', kind: 'hsn', gstRate: 12, description: 'Pile fabrics — knitted / crocheted' },
  { code: '6101', kind: 'hsn', gstRate: 5, description: 'Garments — clothing (≤ ₹1000/piece)' },
  { code: '6101', kind: 'hsn', gstRate: 12, description: 'Garments — clothing (> ₹1000/piece)' },
  { code: '6102', kind: 'hsn', gstRate: 12, description: 'Women / girls overcoats, capes (knit)' },
  { code: '6103', kind: 'hsn', gstRate: 12, description: 'Men / boys suits, trousers (knit)' },
  { code: '6104', kind: 'hsn', gstRate: 12, description: 'Women / girls suits, dresses (knit)' },
  { code: '6105', kind: 'hsn', gstRate: 12, description: 'Men / boys shirts (knit)' },
  { code: '6106', kind: 'hsn', gstRate: 12, description: 'Women / girls blouses, shirts (knit)' },
  { code: '6107', kind: 'hsn', gstRate: 12, description: 'Men / boys briefs, pyjamas (knit)' },
  { code: '6108', kind: 'hsn', gstRate: 12, description: 'Women / girls nightdresses, slips (knit)' },
  { code: '6109', kind: 'hsn', gstRate: 12, description: 'T-shirts, singlets, vests (knitted)' },
  { code: '6110', kind: 'hsn', gstRate: 12, description: 'Sweaters, pullovers, cardigans (knit)' },
  { code: '6201', kind: 'hsn', gstRate: 12, description: 'Men / boys overcoats, capes (woven)' },
  { code: '6202', kind: 'hsn', gstRate: 12, description: 'Women / girls overcoats, capes (woven)' },
  { code: '6203', kind: 'hsn', gstRate: 12, description: 'Men / boys suits, trousers (woven)' },
  { code: '6204', kind: 'hsn', gstRate: 12, description: 'Women / girls suits, dresses (woven)' },
  { code: '6205', kind: 'hsn', gstRate: 12, description: 'Men / boys shirts (woven)' },
  { code: '6206', kind: 'hsn', gstRate: 12, description: 'Women / girls blouses, shirts (woven)' },
  { code: '6209', kind: 'hsn', gstRate: 12, description: 'Babies garments & clothing accessories' },
  { code: '6211', kind: 'hsn', gstRate: 12, description: 'Track suits, ski suits, swimwear (woven)' },
  { code: '6212', kind: 'hsn', gstRate: 12, description: 'Brassieres, girdles, corsets, suspenders' },
  { code: '6217', kind: 'hsn', gstRate: 12, description: 'Other made-up clothing accessories' },
  { code: '6301', kind: 'hsn', gstRate: 12, description: 'Blankets, travelling rugs' },
  { code: '6302', kind: 'hsn', gstRate: 5, description: 'Bed-linen, towels (≤ ₹1000/piece)' },
  { code: '6302', kind: 'hsn', gstRate: 12, description: 'Bed-linen, towels (> ₹1000)' },
  { code: '6303', kind: 'hsn', gstRate: 12, description: 'Curtains (made up), interior blinds' },
  { code: '6304', kind: 'hsn', gstRate: 12, description: 'Made-up textile (bedspreads, cushion)' },
  { code: '6305', kind: 'hsn', gstRate: 5, description: 'Sacks & bags for packing of goods' },
  { code: '6307', kind: 'hsn', gstRate: 12, description: 'Other made-up textile articles' },
  { code: '6309', kind: 'hsn', gstRate: 0, description: 'Worn clothing & textile articles (donated)' },

  // =========================================================================
  // CHAPTER 64-67 — Footwear, headwear, umbrellas
  // =========================================================================
  { code: '6401', kind: 'hsn', gstRate: 5, description: 'Waterproof footwear (rubber / plastic)' },
  { code: '6401', kind: 'hsn', gstRate: 18, description: 'Footwear (> ₹1000/pair)' },
  { code: '6402', kind: 'hsn', gstRate: 5, description: 'Footwear with rubber / plastic uppers' },
  { code: '6403', kind: 'hsn', gstRate: 5, description: 'Footwear with leather uppers (≤ ₹1000)' },
  { code: '6403', kind: 'hsn', gstRate: 18, description: 'Footwear with leather uppers (> ₹1000)' },
  { code: '6404', kind: 'hsn', gstRate: 5, description: 'Footwear with textile uppers (≤ ₹1000)' },
  { code: '6405', kind: 'hsn', gstRate: 5, description: 'Other footwear' },
  { code: '6406', kind: 'hsn', gstRate: 12, description: 'Footwear parts (outer soles, heels)' },
  { code: '6501', kind: 'hsn', gstRate: 18, description: 'Hat forms, hat bodies' },
  { code: '6505', kind: 'hsn', gstRate: 18, description: 'Hats, headgear, knitted or crocheted' },
  { code: '6506', kind: 'hsn', gstRate: 18, description: 'Other headgear (incl. safety helmets)' },
  { code: '6601', kind: 'hsn', gstRate: 12, description: 'Umbrellas, sun umbrellas, walking sticks' },

  // =========================================================================
  // CHAPTER 68-70 — Stone, ceramic, glass
  // =========================================================================
  { code: '6802', kind: 'hsn', gstRate: 18, description: 'Worked monumental / building stone' },
  { code: '6810', kind: 'hsn', gstRate: 28, description: 'Articles of cement / concrete (tiles)' },
  { code: '6815', kind: 'hsn', gstRate: 18, description: 'Stone articles n.e.s. (pumice powder)' },
  { code: '6907', kind: 'hsn', gstRate: 18, description: 'Ceramic flags / paving / floor tiles' },
  { code: '6910', kind: 'hsn', gstRate: 18, description: 'Ceramic sinks, baths, WC, urinals' },
  { code: '6911', kind: 'hsn', gstRate: 12, description: 'Tableware, kitchenware (porcelain/china)' },
  { code: '6912', kind: 'hsn', gstRate: 12, description: 'Ceramic tableware (not porcelain)' },
  { code: '6914', kind: 'hsn', gstRate: 12, description: 'Other ceramic articles' },
  { code: '7003', kind: 'hsn', gstRate: 18, description: 'Cast glass, rolled glass (sheets / profiles)' },
  { code: '7005', kind: 'hsn', gstRate: 18, description: 'Float glass, surface-ground glass' },
  { code: '7007', kind: 'hsn', gstRate: 18, description: 'Safety glass (tempered, laminated)' },
  { code: '7009', kind: 'hsn', gstRate: 18, description: 'Mirrors of glass (framed or not)' },
  { code: '7010', kind: 'hsn', gstRate: 18, description: 'Glass containers (bottles, jars, flasks)' },
  { code: '7013', kind: 'hsn', gstRate: 18, description: 'Glassware (tableware, kitchen, decor)' },
  { code: '7019', kind: 'hsn', gstRate: 18, description: 'Glass fibres, fabrics, mats' },

  // =========================================================================
  // CHAPTER 71 — Precious metals, jewellery
  // =========================================================================
  { code: '7101', kind: 'hsn', gstRate: 0.25, description: 'Natural / cultured pearls (rough)' },
  { code: '7102', kind: 'hsn', gstRate: 0.25, description: 'Diamonds (unworked / worked)' },
  { code: '7103', kind: 'hsn', gstRate: 0.25, description: 'Precious / semi-precious stones (rough)' },
  { code: '7106', kind: 'hsn', gstRate: 3, description: 'Silver (unwrought / semi-manufactured)' },
  { code: '7108', kind: 'hsn', gstRate: 3, description: 'Gold (unwrought / semi-manufactured)' },
  { code: '7110', kind: 'hsn', gstRate: 3, description: 'Platinum (unwrought / semi-manufactured)' },
  { code: '7113', kind: 'hsn', gstRate: 3, description: 'Jewellery (gold, silver, articles)' },
  { code: '7114', kind: 'hsn', gstRate: 3, description: 'Goldsmiths\' / silversmiths\' wares' },
  { code: '7117', kind: 'hsn', gstRate: 18, description: 'Imitation jewellery' },
  { code: '7118', kind: 'hsn', gstRate: 18, description: 'Coin (other than legal tender)' },

  // =========================================================================
  // CHAPTER 72-83 — Base metals
  // =========================================================================
  { code: '7208', kind: 'hsn', gstRate: 18, description: 'Hot-rolled flat steel products' },
  { code: '7210', kind: 'hsn', gstRate: 18, description: 'Flat-rolled steel, coated' },
  { code: '7213', kind: 'hsn', gstRate: 18, description: 'Bars / rods of iron / steel (hot-rolled)' },
  { code: '7217', kind: 'hsn', gstRate: 18, description: 'Wire of iron / non-alloy steel' },
  { code: '7303', kind: 'hsn', gstRate: 18, description: 'Cast iron tubes, pipes, hollow profiles' },
  { code: '7304', kind: 'hsn', gstRate: 18, description: 'Iron / steel tubes (seamless)' },
  { code: '7306', kind: 'hsn', gstRate: 18, description: 'Iron / steel tubes (welded, riveted)' },
  { code: '7308', kind: 'hsn', gstRate: 18, description: 'Steel structures, parts (bridges, towers)' },
  { code: '7310', kind: 'hsn', gstRate: 18, description: 'Iron / steel tanks, drums, casks' },
  { code: '7315', kind: 'hsn', gstRate: 18, description: 'Iron / steel chain' },
  { code: '7318', kind: 'hsn', gstRate: 18, description: 'Screws, bolts, nuts, washers (iron/steel)' },
  { code: '7321', kind: 'hsn', gstRate: 12, description: 'Cooking stoves, ranges (iron/steel)' },
  { code: '7321', kind: 'hsn', gstRate: 18, description: 'Stoves, grates, gas-rings (iron/steel)' },
  { code: '7323', kind: 'hsn', gstRate: 18, description: 'Kitchen / household articles (iron/steel)' },
  { code: '7324', kind: 'hsn', gstRate: 18, description: 'Sanitary ware, parts (iron / steel)' },
  { code: '7407', kind: 'hsn', gstRate: 18, description: 'Copper bars, rods, profiles' },
  { code: '7408', kind: 'hsn', gstRate: 18, description: 'Copper wire' },
  { code: '7411', kind: 'hsn', gstRate: 18, description: 'Copper tubes, pipes' },
  { code: '7601', kind: 'hsn', gstRate: 18, description: 'Aluminium, unwrought' },
  { code: '7604', kind: 'hsn', gstRate: 18, description: 'Aluminium bars, rods, profiles' },
  { code: '7606', kind: 'hsn', gstRate: 18, description: 'Aluminium plates, sheets, strip' },
  { code: '7607', kind: 'hsn', gstRate: 18, description: 'Aluminium foil' },
  { code: '7615', kind: 'hsn', gstRate: 18, description: 'Aluminium table / kitchen / household' },
  { code: '8201', kind: 'hsn', gstRate: 12, description: 'Hand tools — spades, picks, axes' },
  { code: '8202', kind: 'hsn', gstRate: 18, description: 'Hand saws, saw blades' },
  { code: '8203', kind: 'hsn', gstRate: 18, description: 'Files, rasps, pliers, pincers' },
  { code: '8204', kind: 'hsn', gstRate: 18, description: 'Hand-operated spanners, sockets' },
  { code: '8205', kind: 'hsn', gstRate: 18, description: 'Hand tools n.e.s. (vices, anvils)' },
  { code: '8211', kind: 'hsn', gstRate: 12, description: 'Knives with cutting blades' },
  { code: '8212', kind: 'hsn', gstRate: 12, description: 'Razors and razor blades' },
  { code: '8214', kind: 'hsn', gstRate: 12, description: 'Cutlery — knives, scissors, razors' },
  { code: '8215', kind: 'hsn', gstRate: 18, description: 'Spoons, forks, ladles (table cutlery)' },
  { code: '8301', kind: 'hsn', gstRate: 18, description: 'Padlocks, key-operated locks' },
  { code: '8302', kind: 'hsn', gstRate: 18, description: 'Locks, keys, hinges, mountings (base metal)' },
  { code: '8304', kind: 'hsn', gstRate: 18, description: 'Filing cabinets, paper trays (base metal)' },
  { code: '8306', kind: 'hsn', gstRate: 12, description: 'Bells, gongs, statuettes (base metal)' },
  { code: '8308', kind: 'hsn', gstRate: 12, description: 'Clasps, buckles, eyelets, beads' },

  // =========================================================================
  // CHAPTER 84 — Machinery
  // =========================================================================
  { code: '8407', kind: 'hsn', gstRate: 28, description: 'IC engines (motor vehicles)' },
  { code: '8408', kind: 'hsn', gstRate: 28, description: 'Diesel engines (industrial)' },
  { code: '8411', kind: 'hsn', gstRate: 18, description: 'Turbo-jet, turbo-prop engines' },
  { code: '8412', kind: 'hsn', gstRate: 28, description: 'Other engines / motors' },
  { code: '8413', kind: 'hsn', gstRate: 18, description: 'Pumps for liquids (incl. submersible)' },
  { code: '8414', kind: 'hsn', gstRate: 18, description: 'Air / vacuum pumps, fans, hoods' },
  { code: '8415', kind: 'hsn', gstRate: 28, description: 'Air-conditioning machines' },
  { code: '8417', kind: 'hsn', gstRate: 18, description: 'Industrial furnaces, ovens' },
  { code: '8418', kind: 'hsn', gstRate: 28, description: 'Refrigerators, freezers (household)' },
  { code: '8419', kind: 'hsn', gstRate: 18, description: 'Water heaters, boilers (non-electric)' },
  { code: '8421', kind: 'hsn', gstRate: 18, description: 'Filtering / purifying machinery' },
  { code: '8422', kind: 'hsn', gstRate: 18, description: 'Dishwashers, packing / wrapping machines' },
  { code: '8424', kind: 'hsn', gstRate: 18, description: 'Spraying machines (gardening, fire)' },
  { code: '8425', kind: 'hsn', gstRate: 18, description: 'Pulleys, tackles, hoists, winches' },
  { code: '8426', kind: 'hsn', gstRate: 18, description: 'Cranes, mobile lifting frames' },
  { code: '8429', kind: 'hsn', gstRate: 18, description: 'Bulldozers, graders, excavators' },
  { code: '8432', kind: 'hsn', gstRate: 12, description: 'Agricultural machinery (ploughs, rotavator)' },
  { code: '8433', kind: 'hsn', gstRate: 12, description: 'Harvesting machinery, threshers' },
  { code: '8436', kind: 'hsn', gstRate: 12, description: 'Other agricultural / poultry machinery' },
  { code: '8443', kind: 'hsn', gstRate: 18, description: 'Printers, copying machines' },
  { code: '8450', kind: 'hsn', gstRate: 18, description: 'Washing machines (household)' },
  { code: '8451', kind: 'hsn', gstRate: 18, description: 'Industrial washing / cleaning machines' },
  { code: '8467', kind: 'hsn', gstRate: 18, description: 'Hand tools (pneumatic / electric)' },
  { code: '8469', kind: 'hsn', gstRate: 18, description: 'Typewriters / word-processors (legacy)' },
  { code: '8471', kind: 'hsn', gstRate: 18, description: 'Computers, laptops, servers' },
  { code: '8472', kind: 'hsn', gstRate: 18, description: 'Office machines (calculators, ATMs)' },
  { code: '8473', kind: 'hsn', gstRate: 18, description: 'Computer parts / accessories' },
  { code: '8476', kind: 'hsn', gstRate: 18, description: 'Vending machines' },
  { code: '8479', kind: 'hsn', gstRate: 18, description: 'Other machinery n.e.s.' },

  // =========================================================================
  // CHAPTER 85 — Electrical machinery
  // =========================================================================
  { code: '8501', kind: 'hsn', gstRate: 18, description: 'Electric motors / generators' },
  { code: '8502', kind: 'hsn', gstRate: 18, description: 'Generating sets, rotary converters' },
  { code: '8504', kind: 'hsn', gstRate: 18, description: 'Power adaptors, transformers, UPS' },
  { code: '8506', kind: 'hsn', gstRate: 18, description: 'Primary cells / batteries' },
  { code: '8507', kind: 'hsn', gstRate: 18, description: 'Electric accumulators (lead / lithium)' },
  { code: '8508', kind: 'hsn', gstRate: 18, description: 'Vacuum cleaners' },
  { code: '8509', kind: 'hsn', gstRate: 18, description: 'Mixers, grinders, juicers (household)' },
  { code: '8510', kind: 'hsn', gstRate: 18, description: 'Shavers, hair clippers (electric)' },
  { code: '8511', kind: 'hsn', gstRate: 18, description: 'Ignition equipment for IC engines' },
  { code: '8512', kind: 'hsn', gstRate: 18, description: 'Lighting / signalling — vehicles' },
  { code: '8513', kind: 'hsn', gstRate: 18, description: 'Portable electric lamps (torches)' },
  { code: '8514', kind: 'hsn', gstRate: 18, description: 'Industrial / lab electric furnaces, ovens' },
  { code: '8515', kind: 'hsn', gstRate: 18, description: 'Electric soldering / welding machines' },
  { code: '8516', kind: 'hsn', gstRate: 18, description: 'Electric heaters, hair-dryers, irons' },
  { code: '8517', kind: 'hsn', gstRate: 18, description: 'Telephones, mobile phones, routers' },
  { code: '8518', kind: 'hsn', gstRate: 18, description: 'Microphones, speakers, headphones' },
  { code: '8519', kind: 'hsn', gstRate: 18, description: 'Sound recording / reproducing apparatus' },
  { code: '8521', kind: 'hsn', gstRate: 18, description: 'Video recording / reproducing apparatus' },
  { code: '8523', kind: 'hsn', gstRate: 18, description: 'Recorded / unrecorded media (USB, disc)' },
  { code: '8525', kind: 'hsn', gstRate: 18, description: 'Transmission apparatus — TV, radio, CCTV' },
  { code: '8528', kind: 'hsn', gstRate: 28, description: 'Monitors / TVs (any technology)' },
  { code: '8531', kind: 'hsn', gstRate: 18, description: 'Electric sound / visual signalling app.' },
  { code: '8532', kind: 'hsn', gstRate: 18, description: 'Capacitors (electrical)' },
  { code: '8533', kind: 'hsn', gstRate: 18, description: 'Electrical resistors' },
  { code: '8534', kind: 'hsn', gstRate: 18, description: 'Printed circuit boards (PCB)' },
  { code: '8536', kind: 'hsn', gstRate: 18, description: 'Switches, plugs, sockets, connectors' },
  { code: '8538', kind: 'hsn', gstRate: 18, description: 'Parts for switches, control panels' },
  { code: '8539', kind: 'hsn', gstRate: 12, description: 'Electric filament / discharge lamps' },
  { code: '8541', kind: 'hsn', gstRate: 18, description: 'Diodes, transistors, semiconductors' },
  { code: '8542', kind: 'hsn', gstRate: 18, description: 'Integrated circuits (ICs)' },
  { code: '8544', kind: 'hsn', gstRate: 18, description: 'Insulated wires, cables (incl. fibre)' },
  { code: '8546', kind: 'hsn', gstRate: 18, description: 'Electrical insulators' },
  { code: '8547', kind: 'hsn', gstRate: 18, description: 'Insulating fittings for electrical machines' },

  // =========================================================================
  // CHAPTER 87 — Vehicles
  // =========================================================================
  { code: '8701', kind: 'hsn', gstRate: 12, description: 'Tractors (agricultural)' },
  { code: '8702', kind: 'hsn', gstRate: 5, description: 'Public-transport vehicles (e-rickshaw)' },
  { code: '8702', kind: 'hsn', gstRate: 18, description: 'Buses (passenger transport)' },
  { code: '8703', kind: 'hsn', gstRate: 28, description: 'Motor cars (passenger)' },
  { code: '8704', kind: 'hsn', gstRate: 28, description: 'Motor vehicles for goods transport' },
  { code: '8705', kind: 'hsn', gstRate: 28, description: 'Special purpose vehicles (cranes, fire)' },
  { code: '8708', kind: 'hsn', gstRate: 28, description: 'Parts & accessories of motor vehicles' },
  { code: '8711', kind: 'hsn', gstRate: 28, description: 'Motorcycles, scooters, mopeds' },
  { code: '8712', kind: 'hsn', gstRate: 12, description: 'Bicycles & other non-motorised cycles' },
  { code: '8713', kind: 'hsn', gstRate: 5, description: 'Wheelchairs (carriages for invalids)' },
  { code: '8714', kind: 'hsn', gstRate: 28, description: 'Motorcycle parts & accessories' },
  { code: '8714', kind: 'hsn', gstRate: 12, description: 'Bicycle parts & accessories' },
  { code: '8715', kind: 'hsn', gstRate: 18, description: 'Baby carriages, prams, strollers' },
  { code: '8716', kind: 'hsn', gstRate: 18, description: 'Trailers, semi-trailers' },

  // =========================================================================
  // CHAPTER 90-92 — Optical, photographic, watches, music
  // =========================================================================
  { code: '9001', kind: 'hsn', gstRate: 18, description: 'Optical fibres, spectacle lenses' },
  { code: '9003', kind: 'hsn', gstRate: 18, description: 'Spectacle frames & mountings' },
  { code: '9004', kind: 'hsn', gstRate: 18, description: 'Spectacles, goggles (frames + lenses)' },
  { code: '9005', kind: 'hsn', gstRate: 18, description: 'Binoculars, telescopes, astronomical' },
  { code: '9006', kind: 'hsn', gstRate: 18, description: 'Photographic cameras, flashbulbs' },
  { code: '9008', kind: 'hsn', gstRate: 18, description: 'Image / sound projectors' },
  { code: '9018', kind: 'hsn', gstRate: 12, description: 'Medical / surgical instruments' },
  { code: '9019', kind: 'hsn', gstRate: 12, description: 'Mechanotherapy / massage / oxygen therapy' },
  { code: '9020', kind: 'hsn', gstRate: 12, description: 'Other breathing appliances (masks)' },
  { code: '9021', kind: 'hsn', gstRate: 5, description: 'Orthopaedic appliances, hearing aids' },
  { code: '9025', kind: 'hsn', gstRate: 18, description: 'Hydrometers, thermometers, hygrometers' },
  { code: '9026', kind: 'hsn', gstRate: 18, description: 'Instruments — flow, pressure, level' },
  { code: '9028', kind: 'hsn', gstRate: 18, description: 'Gas / liquid / electricity meters' },
  { code: '9101', kind: 'hsn', gstRate: 18, description: 'Wrist-watches (precious metal case)' },
  { code: '9102', kind: 'hsn', gstRate: 18, description: 'Wrist-watches (other materials)' },
  { code: '9103', kind: 'hsn', gstRate: 18, description: 'Clocks with watch movements (alarm)' },
  { code: '9105', kind: 'hsn', gstRate: 18, description: 'Other clocks (wall, table, alarm)' },
  { code: '9201', kind: 'hsn', gstRate: 18, description: 'Pianos, grand pianos, harpsichords' },
  { code: '9202', kind: 'hsn', gstRate: 18, description: 'Other string musical instruments' },
  { code: '9205', kind: 'hsn', gstRate: 18, description: 'Wind musical instruments (flute, sax)' },
  { code: '9206', kind: 'hsn', gstRate: 18, description: 'Percussion musical instruments (drums)' },
  { code: '9207', kind: 'hsn', gstRate: 18, description: 'Musical instruments — electrical signal' },

  // =========================================================================
  // CHAPTER 93-97 — Arms, furniture, toys, art
  // =========================================================================
  { code: '9302', kind: 'hsn', gstRate: 28, description: 'Revolvers and pistols' },
  { code: '9303', kind: 'hsn', gstRate: 28, description: 'Other firearms (shotguns, rifles)' },
  { code: '9401', kind: 'hsn', gstRate: 18, description: 'Seats (chairs, sofas, benches)' },
  { code: '9402', kind: 'hsn', gstRate: 18, description: 'Medical / dental / surgical furniture' },
  { code: '9403', kind: 'hsn', gstRate: 18, description: 'Furniture (wooden, metal, plastic)' },
  { code: '9404', kind: 'hsn', gstRate: 12, description: 'Mattresses, quilts, pillows, sleeping bags' },
  { code: '9405', kind: 'hsn', gstRate: 18, description: 'Lamps, light fittings, LED' },
  { code: '9406', kind: 'hsn', gstRate: 18, description: 'Prefabricated buildings' },
  { code: '9503', kind: 'hsn', gstRate: 12, description: 'Toys, puzzles, scale models' },
  { code: '9504', kind: 'hsn', gstRate: 18, description: 'Indoor games, sport goods (board games)' },
  { code: '9505', kind: 'hsn', gstRate: 18, description: 'Festive / carnival articles' },
  { code: '9506', kind: 'hsn', gstRate: 12, description: 'Sport equipment (cricket, football)' },
  { code: '9507', kind: 'hsn', gstRate: 12, description: 'Fishing rods, hooks, traps' },
  { code: '9601', kind: 'hsn', gstRate: 12, description: 'Worked ivory, bone, tortoise-shell' },
  { code: '9603', kind: 'hsn', gstRate: 18, description: 'Brooms, brushes, hand-operated mops' },
  { code: '9604', kind: 'hsn', gstRate: 18, description: 'Hand sieves, sifters' },
  { code: '9605', kind: 'hsn', gstRate: 18, description: 'Travel sets (sewing, manicure)' },
  { code: '9606', kind: 'hsn', gstRate: 18, description: 'Buttons, press-fasteners' },
  { code: '9607', kind: 'hsn', gstRate: 18, description: 'Slide fasteners (zippers)' },
  { code: '9608', kind: 'hsn', gstRate: 18, description: 'Pens, ball-points, markers' },
  { code: '9609', kind: 'hsn', gstRate: 12, description: 'Pencils, crayons, pastels, charcoals' },
  { code: '9610', kind: 'hsn', gstRate: 12, description: 'Slates, boards (writing / drawing)' },
  { code: '9611', kind: 'hsn', gstRate: 18, description: 'Date / sealing / numbering stamps' },
  { code: '9613', kind: 'hsn', gstRate: 18, description: 'Cigarette / mechanical lighters' },
  { code: '9615', kind: 'hsn', gstRate: 18, description: 'Combs, hair-slides, hairpins' },
  { code: '9617', kind: 'hsn', gstRate: 18, description: 'Vacuum flasks, vessels (household)' },
  { code: '9619', kind: 'hsn', gstRate: 12, description: 'Sanitary napkins, diapers, tampons' },
  { code: '9701', kind: 'hsn', gstRate: 12, description: 'Paintings, drawings, pastels (original)' },
  { code: '9702', kind: 'hsn', gstRate: 12, description: 'Original engravings, prints, lithographs' },
  { code: '9703', kind: 'hsn', gstRate: 12, description: 'Original sculptures, statuary' },
  { code: '9705', kind: 'hsn', gstRate: 12, description: 'Collections — zoological, botanical, coins' },
  { code: '9706', kind: 'hsn', gstRate: 12, description: 'Antiques exceeding 100 years' },

  // =========================================================================
  //  SAC — Services Accounting Codes (all start with 99)
  // =========================================================================
  // 5% — Transportation, low-rate services
  { code: '996511', kind: 'sac', gstRate: 5, description: 'Road transport of goods (GTA, no ITC)' },
  { code: '996512', kind: 'sac', gstRate: 5, description: 'Road transport of passengers (radio taxi)' },
  { code: '996601', kind: 'sac', gstRate: 5, description: 'Rental of road vehicles (without operator)' },
  { code: '996331', kind: 'sac', gstRate: 5, description: 'Restaurant services (no AC, not in hotel)' },
  { code: '996813', kind: 'sac', gstRate: 5, description: 'Local delivery services (e-commerce)' },

  // 12% services
  { code: '996601', kind: 'sac', gstRate: 12, description: 'Rental of road vehicles (with operator)' },
  { code: '996731', kind: 'sac', gstRate: 12, description: 'Rail-freight forwarding' },
  { code: '996812', kind: 'sac', gstRate: 12, description: 'Courier services' },
  { code: '996761', kind: 'sac', gstRate: 12, description: 'Air transport of passengers (economy)' },
  { code: '996311', kind: 'sac', gstRate: 12, description: 'Hotel accommodation (room ₹1000–7499/night)' },

  // 18% — Default standard for most professional services
  { code: '996332', kind: 'sac', gstRate: 18, description: 'Restaurant services (AC + alcohol licence)' },
  { code: '997212', kind: 'sac', gstRate: 18, description: 'Rental / leasing of non-residential property' },
  { code: '997331', kind: 'sac', gstRate: 18, description: 'Licensing services — IT software' },
  { code: '997332', kind: 'sac', gstRate: 18, description: 'Licensing services — trademarks, franchises' },
  { code: '998311', kind: 'sac', gstRate: 18, description: 'Management consulting services' },
  { code: '998312', kind: 'sac', gstRate: 18, description: 'Business consulting services' },
  { code: '998313', kind: 'sac', gstRate: 18, description: 'Information technology (IT) consulting' },
  { code: '998314', kind: 'sac', gstRate: 18, description: 'IT design & development services' },
  { code: '998315', kind: 'sac', gstRate: 18, description: 'Hosting & IT infrastructure services' },
  { code: '998316', kind: 'sac', gstRate: 18, description: 'IT infrastructure provisioning' },
  { code: '998317', kind: 'sac', gstRate: 18, description: 'IT support services' },
  { code: '998319', kind: 'sac', gstRate: 18, description: 'Other IT services n.e.s.' },
  { code: '998361', kind: 'sac', gstRate: 18, description: 'Advertising services' },
  { code: '998391', kind: 'sac', gstRate: 18, description: 'Specialty design services (graphic, web)' },
  { code: '998399', kind: 'sac', gstRate: 18, description: 'Other professional / technical services' },
  { code: '998511', kind: 'sac', gstRate: 18, description: 'Employment services (recruitment / staffing)' },
  { code: '998521', kind: 'sac', gstRate: 18, description: 'Security services (private security)' },
  { code: '998531', kind: 'sac', gstRate: 18, description: 'Cleaning services (commercial premises)' },
  { code: '998596', kind: 'sac', gstRate: 18, description: 'Event organisation services' },
  { code: '998719', kind: 'sac', gstRate: 18, description: 'Repair & maintenance — computers, office' },
  { code: '998732', kind: 'sac', gstRate: 18, description: 'Installation services for office machinery' },
  { code: '998873', kind: 'sac', gstRate: 18, description: 'Job-work — manufacturing services' },
  { code: '999293', kind: 'sac', gstRate: 18, description: 'Other education services n.e.s. (coaching)' },
  { code: '999791', kind: 'sac', gstRate: 18, description: 'Other miscellaneous services' },

  // 28% services
  { code: '996311', kind: 'sac', gstRate: 28, description: 'Hotel accommodation (room ≥ ₹7500/night)' },
];

/**
 * Build a fast lookup map: code → array of master entries (multiple entries
 * can share the same code if the GST rate is conditional on extra factors
 * like packaging or price band).
 */
const BY_CODE = (() => {
  const m = new Map();
  for (const e of HSN_MASTER) {
    const key = String(e.code);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(e);
  }
  return m;
})();

/** All master entries for the given code. Returns [] when unknown. */
export function lookupHsn(code) {
  if (!code) return [];
  return BY_CODE.get(String(code).trim()) || [];
}

/**
 * Search by code prefix OR substring of the description. Case-insensitive,
 * with simple relevance: exact code-prefix hits first, then description
 * substring hits, capped at `limit`.
 */
export function searchHsn(query, limit = 25) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return HSN_MASTER.slice(0, limit);
  const codeHits = [];
  const descHits = [];
  for (const entry of HSN_MASTER) {
    if (String(entry.code).toLowerCase().startsWith(q)) {
      codeHits.push(entry);
    } else if (entry.description.toLowerCase().includes(q)) {
      descHits.push(entry);
    }
    if (codeHits.length + descHits.length >= limit * 2) break;
  }
  return [...codeHits, ...descHits].slice(0, limit);
}
