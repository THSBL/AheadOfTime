export interface LocationRecognitionResult {
  raw: string;
  recognized: boolean;
  city?: string;
  stateOrCountry?: string;
  postalCode?: string;
  displayLabel: string;
  travelBufferMinutes?: number;
}

/**
 * Country-prefixed or unique code entries for precise matching
 */
const KNOWN_EXACT_CODES: Record<string, { city: string; region: string; buffer: number }> = {
  // Belgium (B-XXXX or XXXX)
  'B-1000': { city: 'Brussels (Bruxelles)', region: 'Belgium', buffer: 20 },
  'B-1050': { city: 'Ixelles / Elsene', region: 'Brussels, Belgium', buffer: 20 },
  'B-2000': { city: 'Antwerp (Antwerpen)', region: 'Flanders, Belgium', buffer: 20 },
  'B-9000': { city: 'Ghent (Gent)', region: 'Flanders, Belgium', buffer: 20 },
  'B-8000': { city: 'Bruges (Brugge)', region: 'Flanders, Belgium', buffer: 20 },
  'B-3000': { city: 'Leuven', region: 'Flanders, Belgium', buffer: 20 },
  'B-4000': { city: 'Liège (Luik)', region: 'Wallonia, Belgium', buffer: 20 },
  'B-5000': { city: 'Namur (Namen)', region: 'Wallonia, Belgium', buffer: 20 },
  'B-6000': { city: 'Charleroi', region: 'Wallonia, Belgium', buffer: 20 },
  'B-8500': { city: 'Kortrijk', region: 'Flanders, Belgium', buffer: 20 },
  'B-3500': { city: 'Hasselt', region: 'Flanders, Belgium', buffer: 20 },
  'B-2800': { city: 'Mechelen', region: 'Flanders, Belgium', buffer: 20 },
  'B-9300': { city: 'Aalst', region: 'Flanders, Belgium', buffer: 20 },
  'B-8400': { city: 'Ostend (Oostende)', region: 'Flanders, Belgium', buffer: 20 },

  // Netherlands (NL-XXXX or 4 digits + 2 letters e.g. 1012 AB)
  'NL-1012': { city: 'Amsterdam (Centrum)', region: 'Netherlands', buffer: 20 },
  'NL-1011': { city: 'Amsterdam', region: 'Netherlands', buffer: 20 },
  'NL-1071': { city: 'Amsterdam (Museumkwartier)', region: 'Netherlands', buffer: 20 },
  'NL-3011': { city: 'Rotterdam', region: 'Netherlands', buffer: 20 },
  'NL-2511': { city: 'The Hague (Den Haag)', region: 'Netherlands', buffer: 20 },
  'NL-3511': { city: 'Utrecht', region: 'Netherlands', buffer: 20 },
  'NL-5611': { city: 'Eindhoven', region: 'Netherlands', buffer: 20 },
  'NL-9711': { city: 'Groningen', region: 'Netherlands', buffer: 20 },
  'NL-6211': { city: 'Maastricht', region: 'Netherlands', buffer: 20 },
  'NL-5038': { city: 'Tilburg', region: 'Netherlands', buffer: 20 },
  'NL-4811': { city: 'Breda', region: 'Netherlands', buffer: 20 },
  'NL-6511': { city: 'Nijmegen', region: 'Netherlands', buffer: 20 },
  'NL-6811': { city: 'Arnhem', region: 'Netherlands', buffer: 20 },

  // France (F-XXXXX or 5 digits)
  '75001': { city: 'Paris (1er Louvre)', region: 'Île-de-France, France', buffer: 25 },
  '75008': { city: 'Paris (Champs-Élysées)', region: 'Île-de-France, France', buffer: 25 },
  '75016': { city: 'Paris (16e)', region: 'Île-de-France, France', buffer: 25 },
  '69001': { city: 'Lyon (1er)', region: 'Auvergne-Rhône-Alpes, France', buffer: 20 },
  '69002': { city: 'Lyon (Presqu’île)', region: 'Auvergne-Rhône-Alpes, France', buffer: 20 },
  '13001': { city: 'Marseille (1er)', region: 'Provence-Alpes-Côte d’Azur, France', buffer: 25 },
  '33000': { city: 'Bordeaux', region: 'Nouvelle-Aquitaine, France', buffer: 20 },
  '31000': { city: 'Toulouse', region: 'Occitanie, France', buffer: 20 },
  '06000': { city: 'Nice', region: 'French Riviera, France', buffer: 20 },
  '59000': { city: 'Lille', region: 'Hauts-de-France, France', buffer: 20 },
  '67000': { city: 'Strasbourg', region: 'Grand Est, France', buffer: 20 },
  '44000': { city: 'Nantes', region: 'Pays de la Loire, France', buffer: 20 },
  '34000': { city: 'Montpellier', region: 'Occitanie, France', buffer: 20 },
  '35000': { city: 'Rennes', region: 'Brittany, France', buffer: 20 },

  // Germany (D-XXXXX or 5 digits)
  '10115': { city: 'Berlin (Mitte)', region: 'Germany', buffer: 25 },
  '10117': { city: 'Berlin (Mitte/Unter den Linden)', region: 'Germany', buffer: 25 },
  '80331': { city: 'Munich (München Altstadt)', region: 'Bavaria, Germany', buffer: 25 },
  '20095': { city: 'Hamburg (Altstadt)', region: 'Germany', buffer: 25 },
  '60311': { city: 'Frankfurt am Main (Altstadt)', region: 'Hesse, Germany', buffer: 25 },
  '50667': { city: 'Cologne (Köln Innenstadt)', region: 'North Rhine-Westphalia, Germany', buffer: 20 },
  '70173': { city: 'Stuttgart (Mitte)', region: 'Baden-Württemberg, Germany', buffer: 20 },
  '40213': { city: 'Düsseldorf (Altstadt)', region: 'North Rhine-Westphalia, Germany', buffer: 20 },
  '04109': { city: 'Leipzig', region: 'Saxony, Germany', buffer: 20 },
  '01067': { city: 'Dresden', region: 'Saxony, Germany', buffer: 20 },
  '90403': { city: 'Nuremberg (Nürnberg)', region: 'Bavaria, Germany', buffer: 20 },
  '28195': { city: 'Bremen', region: 'Germany', buffer: 20 },
  '30159': { city: 'Hannover', region: 'Lower Saxony, Germany', buffer: 20 },

  // Italy (5 digits)
  '00187': { city: 'Rome (Colosseo / Centro)', region: 'Lazio, Italy', buffer: 25 },
  '20121': { city: 'Milan (Milano Centro)', region: 'Lombardy, Italy', buffer: 25 },
  '50122': { city: 'Florence (Firenze)', region: 'Tuscany, Italy', buffer: 20 },
  '80121': { city: 'Naples (Napoli)', region: 'Campania, Italy', buffer: 25 },
  '40121': { city: 'Bologna', region: 'Emilia-Romagna, Italy', buffer: 20 },
  '10121': { city: 'Turin (Torino)', region: 'Piedmont, Italy', buffer: 20 },
  '30124': { city: 'Venice (Venezia San Marco)', region: 'Veneto, Italy', buffer: 30 },
  '37121': { city: 'Verona', region: 'Veneto, Italy', buffer: 20 },
  '90133': { city: 'Palermo', region: 'Sicily, Italy', buffer: 20 },

  // Spain (5 digits)
  '28001': { city: 'Madrid (Salamanca)', region: 'Community of Madrid, Spain', buffer: 25 },
  '28013': { city: 'Madrid (Sol / Gran Vía)', region: 'Community of Madrid, Spain', buffer: 25 },
  '08001': { city: 'Barcelona (Ciutat Vella)', region: 'Catalonia, Spain', buffer: 25 },
  '08007': { city: 'Barcelona (Eixample)', region: 'Catalonia, Spain', buffer: 25 },
  '41001': { city: 'Seville (Sevilla)', region: 'Andalusia, Spain', buffer: 20 },
  '46001': { city: 'Valencia', region: 'Valencian Community, Spain', buffer: 20 },
  '29001': { city: 'Málaga', region: 'Andalusia, Spain', buffer: 20 },
  '48001': { city: 'Bilbao', region: 'Basque Country, Spain', buffer: 20 },
  '50001': { city: 'Zaragoza', region: 'Aragon, Spain', buffer: 20 },
  '07001': { city: 'Palma de Mallorca', region: 'Balearic Islands, Spain', buffer: 20 },

  // Switzerland (CH-XXXX or 4 digits)
  'CH-8001': { city: 'Zurich (Zürich Altstadt)', region: 'Zurich, Switzerland', buffer: 20 },
  'CH-1201': { city: 'Geneva (Genève)', region: 'Geneva, Switzerland', buffer: 20 },
  'CH-4001': { city: 'Basel', region: 'Basel-Stadt, Switzerland', buffer: 20 },
  'CH-3001': { city: 'Bern', region: 'Bern, Switzerland', buffer: 20 },
  'CH-1003': { city: 'Lausanne', region: 'Vaud, Switzerland', buffer: 20 },
  'CH-6003': { city: 'Lucerne (Luzern)', region: 'Lucerne, Switzerland', buffer: 20 },
  'CH-6900': { city: 'Lugano', region: 'Ticino, Switzerland', buffer: 20 },

  // Austria (A-XXXX or 4 digits)
  'A-1010': { city: 'Vienna (Wien Innere Stadt)', region: 'Austria', buffer: 20 },
  'A-1020': { city: 'Vienna (Leopoldstadt)', region: 'Austria', buffer: 20 },
  'A-5020': { city: 'Salzburg', region: 'Austria', buffer: 20 },
  'A-6020': { city: 'Innsbruck', region: 'Tyrol, Austria', buffer: 20 },
  'A-8010': { city: 'Graz', region: 'Styria, Austria', buffer: 20 },
  'A-4020': { city: 'Linz', region: 'Upper Austria', buffer: 20 },

  // Portugal (XXXX-XXX)
  'PT-1100': { city: 'Lisbon (Baixa / Alfama)', region: 'Portugal', buffer: 20 },
  'PT-4000': { city: 'Porto', region: 'Portugal', buffer: 20 },
  'PT-8000': { city: 'Faro (Algarve)', region: 'Portugal', buffer: 20 },
  '3000-001': { city: 'Coimbra', region: 'Portugal', buffer: 20 },

  // Ireland (Eircode e.g. D02, D04, T12)
  'D01': { city: 'Dublin 1 (North City)', region: 'Ireland', buffer: 20 },
  'D02': { city: 'Dublin 2 (South City)', region: 'Ireland', buffer: 20 },
  'D04': { city: 'Dublin 4 (Ballsbridge)', region: 'Ireland', buffer: 20 },
  'D06': { city: 'Dublin 6 (Ranelagh)', region: 'Ireland', buffer: 20 },
  'T12': { city: 'Cork City', region: 'Ireland', buffer: 20 },
  'H91': { city: 'Galway City', region: 'Ireland', buffer: 20 },

  // Scandinavia (DK, SE, NO, FI)
  'DK-1050': { city: 'Copenhagen (København)', region: 'Denmark', buffer: 20 },
  '1050': { city: 'Brussels / Copenhagen Area', region: 'Belgium / Denmark', buffer: 20 },
  '111 22': { city: 'Stockholm', region: 'Sweden', buffer: 25 },
  '11122': { city: 'Stockholm', region: 'Sweden', buffer: 25 },
  'NO-0150': { city: 'Oslo', region: 'Norway', buffer: 20 },
  '0150': { city: 'Oslo', region: 'Norway', buffer: 20 },
  'FI-00100': { city: 'Helsinki', region: 'Finland', buffer: 20 },
  '00100': { city: 'Helsinki', region: 'Finland', buffer: 20 },

  // Poland (5 digits / 00-000)
  '00-001': { city: 'Warsaw (Warszawa)', region: 'Poland', buffer: 25 },
  '30-001': { city: 'Kraków', region: 'Poland', buffer: 20 },
  '50-001': { city: 'Wrocław', region: 'Poland', buffer: 20 },
  'PL-00001': { city: 'Warsaw (Warszawa)', region: 'Poland', buffer: 25 },
  'PL-30001': { city: 'Kraków', region: 'Poland', buffer: 20 },
  'PL-50001': { city: 'Wrocław', region: 'Poland', buffer: 20 },

  // UK Postcodes
  'SW1A 1AA': { city: 'London (Westminster)', region: 'UK', buffer: 30 },
  'EC1A 1BB': { city: 'London (City)', region: 'UK', buffer: 30 },
  'W1D': { city: 'London (Soho)', region: 'UK', buffer: 30 },
  'WC2N': { city: 'London (Covent Garden)', region: 'UK', buffer: 30 },
  'E1 6AN': { city: 'London (Shoreditch)', region: 'UK', buffer: 30 },
  'M1': { city: 'Manchester', region: 'UK', buffer: 20 },
  'B1': { city: 'Birmingham', region: 'UK', buffer: 20 },
  'EH1': { city: 'Edinburgh', region: 'Scotland, UK', buffer: 20 },
  'G1': { city: 'Glasgow', region: 'Scotland, UK', buffer: 20 },
  'BS1': { city: 'Bristol', region: 'UK', buffer: 20 },
  'CB1': { city: 'Cambridge', region: 'UK', buffer: 20 },
  'OX1': { city: 'Oxford', region: 'UK', buffer: 20 },

  // US Cities
  '94107': { city: 'San Francisco', region: 'CA, USA', buffer: 25 },
  '94102': { city: 'San Francisco', region: 'CA, USA', buffer: 25 },
  '94103': { city: 'San Francisco', region: 'CA, USA', buffer: 25 },
  '90210': { city: 'Beverly Hills', region: 'CA, USA', buffer: 30 },
  '10001': { city: 'New York', region: 'NY, USA', buffer: 20 },
  '10012': { city: 'New York (SoHo)', region: 'NY, USA', buffer: 20 },
  '78701': { city: 'Austin', region: 'TX, USA', buffer: 20 },
  '78704': { city: 'Austin', region: 'TX, USA', buffer: 20 },
  '60601': { city: 'Chicago', region: 'IL, USA', buffer: 25 },
  '98101': { city: 'Seattle', region: 'WA, USA', buffer: 25 },
  '02138': { city: 'Cambridge / Boston', region: 'MA, USA', buffer: 25 },
  '33139': { city: 'Miami Beach', region: 'FL, USA', buffer: 25 },
  '80202': { city: 'Denver', region: 'CO, USA', buffer: 25 },
};

/**
 * 4-digit code mapping for Belgium / Netherlands / Switzerland / Austria fallback
 */
const FOUR_DIGIT_AREAS: Record<string, { city: string; region: string; buffer: number }> = {
  // Belgium
  '1000': { city: 'Brussels', region: 'Belgium', buffer: 20 },
  '1050': { city: 'Ixelles / Elsene', region: 'Brussels, Belgium', buffer: 20 },
  '2000': { city: 'Antwerp (Antwerpen)', region: 'Flanders, Belgium', buffer: 20 },
  '9000': { city: 'Ghent (Gent)', region: 'Flanders, Belgium', buffer: 20 },
  '8000': { city: 'Bruges (Brugge)', region: 'Flanders, Belgium', buffer: 20 },
  '3000': { city: 'Leuven', region: 'Flanders, Belgium', buffer: 20 },
  '4000': { city: 'Liège (Luik)', region: 'Wallonia, Belgium', buffer: 20 },
  '5000': { city: 'Namur (Namen)', region: 'Wallonia, Belgium', buffer: 20 },
  '6000': { city: 'Charleroi', region: 'Wallonia, Belgium', buffer: 20 },
  '8500': { city: 'Kortrijk', region: 'Flanders, Belgium', buffer: 20 },
  '3500': { city: 'Hasselt', region: 'Flanders, Belgium', buffer: 20 },
  '2800': { city: 'Mechelen', region: 'Flanders, Belgium', buffer: 20 },
  '9300': { city: 'Aalst', region: 'Flanders, Belgium', buffer: 20 },
  '8400': { city: 'Ostend (Oostende)', region: 'Flanders, Belgium', buffer: 20 },

  // Netherlands
  '1012': { city: 'Amsterdam', region: 'Netherlands', buffer: 20 },
  '1011': { city: 'Amsterdam', region: 'Netherlands', buffer: 20 },
  '1071': { city: 'Amsterdam', region: 'Netherlands', buffer: 20 },
  '3011': { city: 'Rotterdam', region: 'Netherlands', buffer: 20 },
  '2511': { city: 'The Hague (Den Haag)', region: 'Netherlands', buffer: 20 },
  '3511': { city: 'Utrecht', region: 'Netherlands', buffer: 20 },
  '5611': { city: 'Eindhoven', region: 'Netherlands', buffer: 20 },
  '9711': { city: 'Groningen', region: 'Netherlands', buffer: 20 },
  '6211': { city: 'Maastricht', region: 'Netherlands', buffer: 20 },

  // Switzerland / Austria
  '8001': { city: 'Zurich', region: 'Switzerland', buffer: 20 },
  '1201': { city: 'Geneva', region: 'Switzerland', buffer: 20 },
  '4001': { city: 'Basel', region: 'Switzerland', buffer: 20 },
  '3001': { city: 'Bern', region: 'Switzerland', buffer: 20 },
  '1010': { city: 'Vienna (Wien)', region: 'Austria', buffer: 20 },
  '5020': { city: 'Salzburg', region: 'Austria', buffer: 20 },
  '6020': { city: 'Innsbruck', region: 'Tyrol, Austria', buffer: 20 },
};

/**
 * Known European and international cities for single city name entries
 */
const KNOWN_EUROPEAN_CITIES: Record<string, { city: string; region: string }> = {
  // Belgium
  'BRUSSELS': { city: 'Brussels (Bruxelles)', region: 'Belgium' },
  'BRUXELLES': { city: 'Brussels (Bruxelles)', region: 'Belgium' },
  'BRUSSEL': { city: 'Brussels (Brussel)', region: 'Belgium' },
  'GHENT': { city: 'Ghent (Gent)', region: 'Belgium' },
  'GENT': { city: 'Ghent (Gent)', region: 'Belgium' },
  'ANTWERP': { city: 'Antwerp (Antwerpen)', region: 'Belgium' },
  'ANTWERPEN': { city: 'Antwerp (Antwerpen)', region: 'Belgium' },
  'BRUGES': { city: 'Bruges (Brugge)', region: 'Belgium' },
  'BRUGGE': { city: 'Bruges (Brugge)', region: 'Belgium' },
  'LEUVEN': { city: 'Leuven', region: 'Belgium' },
  'LOUVAIN': { city: 'Leuven (Louvain)', region: 'Belgium' },
  'LIEGE': { city: 'Liège (Luik)', region: 'Belgium' },
  'LIÈGE': { city: 'Liège', region: 'Belgium' },
  'NAMUR': { city: 'Namur', region: 'Belgium' },
  'CHARLEROI': { city: 'Charleroi', region: 'Belgium' },
  'MECHELEN': { city: 'Mechelen', region: 'Belgium' },
  'HASSELT': { city: 'Hasselt', region: 'Belgium' },
  'KORTRIJK': { city: 'Kortrijk', region: 'Belgium' },
  'OOSTENDE': { city: 'Ostend (Oostende)', region: 'Belgium' },
  'OSTEND': { city: 'Ostend (Oostende)', region: 'Belgium' },
  'AALST': { city: 'Aalst', region: 'Belgium' },

  // Netherlands
  'AMSTERDAM': { city: 'Amsterdam', region: 'Netherlands' },
  'ROTTERDAM': { city: 'Rotterdam', region: 'Netherlands' },
  'THE HAGUE': { city: 'The Hague (Den Haag)', region: 'Netherlands' },
  'DEN HAAG': { city: 'The Hague (Den Haag)', region: 'Netherlands' },
  'UTRECHT': { city: 'Utrecht', region: 'Netherlands' },
  'EINDHOVEN': { city: 'Eindhoven', region: 'Netherlands' },
  'GRONINGEN': { city: 'Groningen', region: 'Netherlands' },
  'MAASTRICHT': { city: 'Maastricht', region: 'Netherlands' },
  'HAARLEM': { city: 'Haarlem', region: 'Netherlands' },
  'BREDA': { city: 'Breda', region: 'Netherlands' },
  'TILBURG': { city: 'Tilburg', region: 'Netherlands' },
  'NIJMEGEN': { city: 'Nijmegen', region: 'Netherlands' },
  'ARNHEM': { city: 'Arnhem', region: 'Netherlands' },

  // France
  'PARIS': { city: 'Paris', region: 'France' },
  'LYON': { city: 'Lyon', region: 'France' },
  'MARSEILLE': { city: 'Marseille', region: 'France' },
  'BORDEAUX': { city: 'Bordeaux', region: 'France' },
  'TOULOUSE': { city: 'Toulouse', region: 'France' },
  'NICE': { city: 'Nice', region: 'France' },
  'NANTES': { city: 'Nantes', region: 'France' },
  'STRASBOURG': { city: 'Strasbourg', region: 'France' },
  'LILLE': { city: 'Lille', region: 'France' },
  'MONTPELLIER': { city: 'Montpellier', region: 'France' },
  'RENNES': { city: 'Rennes', region: 'France' },
  'CANNES': { city: 'Cannes', region: 'France' },

  // Germany
  'BERLIN': { city: 'Berlin', region: 'Germany' },
  'MUNICH': { city: 'Munich (München)', region: 'Germany' },
  'MÜNCHEN': { city: 'Munich (München)', region: 'Germany' },
  'FRANKFURT': { city: 'Frankfurt am Main', region: 'Germany' },
  'HAMBURG': { city: 'Hamburg', region: 'Germany' },
  'COLOGNE': { city: 'Cologne (Köln)', region: 'Germany' },
  'KÖLN': { city: 'Cologne (Köln)', region: 'Germany' },
  'STUTTGART': { city: 'Stuttgart', region: 'Germany' },
  'DUSSELDORF': { city: 'Düsseldorf', region: 'Germany' },
  'DÜSSELDORF': { city: 'Düsseldorf', region: 'Germany' },
  'LEIPZIG': { city: 'Leipzig', region: 'Germany' },
  'DRESDEN': { city: 'Dresden', region: 'Germany' },
  'NUREMBERG': { city: 'Nuremberg (Nürnberg)', region: 'Germany' },
  'NÜRNBERG': { city: 'Nuremberg (Nürnberg)', region: 'Germany' },
  'BREMEN': { city: 'Bremen', region: 'Germany' },
  'HANNOVER': { city: 'Hannover', region: 'Germany' },

  // United Kingdom
  'LONDON': { city: 'London', region: 'United Kingdom' },
  'MANCHESTER': { city: 'Manchester', region: 'United Kingdom' },
  'BIRMINGHAM': { city: 'Birmingham', region: 'United Kingdom' },
  'EDINBURGH': { city: 'Edinburgh', region: 'Scotland, UK' },
  'GLASGOW': { city: 'Glasgow', region: 'Scotland, UK' },
  'BRISTOL': { city: 'Bristol', region: 'United Kingdom' },
  'OXFORD': { city: 'Oxford', region: 'United Kingdom' },
  'CAMBRIDGE': { city: 'Cambridge', region: 'United Kingdom' },
  'LIVERPOOL': { city: 'Liverpool', region: 'United Kingdom' },
  'LEEDS': { city: 'Leeds', region: 'United Kingdom' },
  'BELFAST': { city: 'Belfast', region: 'Northern Ireland, UK' },
  'CARDIFF': { city: 'Cardiff', region: 'Wales, UK' },

  // Italy
  'ROME': { city: 'Rome (Roma)', region: 'Italy' },
  'ROMA': { city: 'Rome (Roma)', region: 'Italy' },
  'MILAN': { city: 'Milan (Milano)', region: 'Italy' },
  'MILANO': { city: 'Milan (Milano)', region: 'Italy' },
  'FLORENCE': { city: 'Florence (Firenze)', region: 'Italy' },
  'FIRENZE': { city: 'Florence (Firenze)', region: 'Italy' },
  'VENICE': { city: 'Venice (Venezia)', region: 'Italy' },
  'VENEZIA': { city: 'Venice (Venezia)', region: 'Italy' },
  'NAPLES': { city: 'Naples (Napoli)', region: 'Italy' },
  'NAPOLI': { city: 'Naples (Napoli)', region: 'Italy' },
  'TURIN': { city: 'Turin (Torino)', region: 'Italy' },
  'TORINO': { city: 'Turin (Torino)', region: 'Italy' },
  'BOLOGNA': { city: 'Bologna', region: 'Italy' },
  'VERONA': { city: 'Verona', region: 'Italy' },
  'PALERMO': { city: 'Palermo', region: 'Italy' },

  // Spain
  'MADRID': { city: 'Madrid', region: 'Spain' },
  'BARCELONA': { city: 'Barcelona', region: 'Spain' },
  'SEVILLE': { city: 'Seville (Sevilla)', region: 'Spain' },
  'SEVILLA': { city: 'Seville (Sevilla)', region: 'Spain' },
  'VALENCIA': { city: 'Valencia', region: 'Spain' },
  'MALAGA': { city: 'Málaga', region: 'Spain' },
  'MÁLAGA': { city: 'Málaga', region: 'Spain' },
  'BILBAO': { city: 'Bilbao', region: 'Spain' },
  'ZARAGOZA': { city: 'Zaragoza', region: 'Spain' },
  'PALMA': { city: 'Palma de Mallorca', region: 'Spain' },
  'IBIZA': { city: 'Ibiza', region: 'Spain' },

  // Switzerland & Austria
  'ZURICH': { city: 'Zurich (Zürich)', region: 'Switzerland' },
  'ZÜRICH': { city: 'Zurich (Zürich)', region: 'Switzerland' },
  'GENEVA': { city: 'Geneva (Genève)', region: 'Switzerland' },
  'GENÈVE': { city: 'Geneva (Genève)', region: 'Switzerland' },
  'BASEL': { city: 'Basel', region: 'Switzerland' },
  'BERN': { city: 'Bern', region: 'Switzerland' },
  'LAUSANNE': { city: 'Lausanne', region: 'Switzerland' },
  'LUCERNE': { city: 'Lucerne (Luzern)', region: 'Switzerland' },
  'LUZERN': { city: 'Lucerne (Luzern)', region: 'Switzerland' },
  'VIENNA': { city: 'Vienna (Wien)', region: 'Austria' },
  'WIEN': { city: 'Vienna (Wien)', region: 'Austria' },
  'SALZBURG': { city: 'Salzburg', region: 'Austria' },
  'INNSBRUCK': { city: 'Innsbruck', region: 'Austria' },
  'GRAZ': { city: 'Graz', region: 'Austria' },

  // Portugal
  'LISBON': { city: 'Lisbon (Lisboa)', region: 'Portugal' },
  'LISBOA': { city: 'Lisbon (Lisboa)', region: 'Portugal' },
  'PORTO': { city: 'Porto', region: 'Portugal' },
  'FARO': { city: 'Faro (Algarve)', region: 'Portugal' },
  'COIMBRA': { city: 'Coimbra', region: 'Portugal' },

  // Ireland
  'DUBLIN': { city: 'Dublin', region: 'Ireland' },
  'CORK': { city: 'Cork', region: 'Ireland' },
  'GALWAY': { city: 'Galway', region: 'Ireland' },
  'LIMERICK': { city: 'Limerick', region: 'Ireland' },

  // Scandinavia & Poland
  'COPENHAGEN': { city: 'Copenhagen (København)', region: 'Denmark' },
  'KØBENHAVN': { city: 'Copenhagen (København)', region: 'Denmark' },
  'STOCKHOLM': { city: 'Stockholm', region: 'Sweden' },
  'OSLO': { city: 'Oslo', region: 'Norway' },
  'HELSINKI': { city: 'Helsinki', region: 'Finland' },
  'WARSAW': { city: 'Warsaw (Warszawa)', region: 'Poland' },
  'WARSZAWA': { city: 'Warsaw (Warszawa)', region: 'Poland' },
  'KRAKOW': { city: 'Kraków', region: 'Poland' },
  'KRAKÓW': { city: 'Kraków', region: 'Poland' },
  'WROCLAW': { city: 'Wrocław', region: 'Poland' },
  'WROCŁAW': { city: 'Wrocław', region: 'Poland' },
  'GDANSK': { city: 'Gdańsk', region: 'Poland' },
  'GDAŃSK': { city: 'Gdańsk', region: 'Poland' },

  // United States Key Hubs
  'SAN FRANCISCO': { city: 'San Francisco', region: 'CA, USA' },
  'NEW YORK': { city: 'New York', region: 'NY, USA' },
  'NYC': { city: 'New York City', region: 'NY, USA' },
  'AUSTIN': { city: 'Austin', region: 'TX, USA' },
  'SEATTLE': { city: 'Seattle', region: 'WA, USA' },
  'CHICAGO': { city: 'Chicago', region: 'IL, USA' },
  'BOSTON': { city: 'Boston', region: 'MA, USA' },
  'LOS ANGELES': { city: 'Los Angeles', region: 'CA, USA' },
  'MIAMI': { city: 'Miami', region: 'FL, USA' },
};

/**
 * Validate and recognize European, UK, US, and international postal codes and cities
 */
export function parseAndRecognizeLocation(input: string): LocationRecognitionResult {
  const clean = input.trim();
  if (!clean) {
    return {
      raw: '',
      recognized: false,
      displayLabel: '',
    };
  }

  const upperClean = clean.toUpperCase();
  const normalizedKey = upperClean.replace(/\s+/g, ' ');
  const strippedKey = upperClean.replace(/[\s-]+/g, '');

  // 1. Direct Known Exact Codes Lookup
  if (KNOWN_EXACT_CODES[normalizedKey]) {
    const info = KNOWN_EXACT_CODES[normalizedKey];
    return {
      raw: clean,
      recognized: true,
      city: info.city,
      stateOrCountry: info.region,
      postalCode: normalizedKey,
      displayLabel: `${info.city}, ${info.region} (${normalizedKey})`,
      travelBufferMinutes: info.buffer,
    };
  }

  if (KNOWN_EXACT_CODES[upperClean]) {
    const info = KNOWN_EXACT_CODES[upperClean];
    return {
      raw: clean,
      recognized: true,
      city: info.city,
      stateOrCountry: info.region,
      postalCode: upperClean,
      displayLabel: `${info.city}, ${info.region} (${upperClean})`,
      travelBufferMinutes: info.buffer,
    };
  }

  if (KNOWN_EXACT_CODES[strippedKey]) {
    const info = KNOWN_EXACT_CODES[strippedKey];
    return {
      raw: clean,
      recognized: true,
      city: info.city,
      stateOrCountry: info.region,
      postalCode: strippedKey,
      displayLabel: `${info.city}, ${info.region} (${clean})`,
      travelBufferMinutes: info.buffer,
    };
  }

  // 2. Dutch Postcode Pattern: 4 digits + optional 2 letters (e.g., 1012 AB, 3011, 2511EZ)
  const nlMatch = clean.match(/^(\d{4})\s*([A-Z]{2})?$/i);
  if (nlMatch) {
    const digits = nlMatch[1];
    const letters = nlMatch[2] ? ` ${nlMatch[2].toUpperCase()}` : '';
    const formattedCode = `${digits}${letters}`;
    const baseInfo = FOUR_DIGIT_AREAS[digits];
    const cityText = baseInfo ? `${baseInfo.city}, ${baseInfo.region}` : 'Netherlands / Belgium Area';
    return {
      raw: clean,
      recognized: true,
      postalCode: formattedCode,
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'Netherlands / Belgium',
      displayLabel: `${cityText} (${formattedCode})`,
      travelBufferMinutes: baseInfo?.buffer || 20,
    };
  }

  // 3. Belgian & Swiss & Austrian 4-digit postal code (e.g. 1000, 9000, 8001, 1010, B-9000, CH-8001)
  const fourDigitMatch = clean.match(/^([B|CH|AT|NL|A|D]-)?\d{4}$/i);
  if (fourDigitMatch) {
    const code = clean.replace(/^[B|CH|AT|NL|A|D]-/i, '');
    const baseInfo = FOUR_DIGIT_AREAS[code];
    const label = baseInfo
      ? `${baseInfo.city}, ${baseInfo.region} (Postal Code: ${clean.toUpperCase()})`
      : `European 4-Digit Postal Code: ${clean.toUpperCase()}`;
    return {
      raw: clean,
      recognized: true,
      postalCode: clean.toUpperCase(),
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'Europe',
      displayLabel: label,
      travelBufferMinutes: baseInfo?.buffer || 20,
    };
  }

  // 4. French, German, Italian, Spanish 5-digit postal code (e.g. 75001, 10115, 28001, 00187, D-10115, F-75001)
  const fiveDigitMatch = clean.match(/^([D|F|I|E|ES]-)?\d{5}$/i);
  if (fiveDigitMatch) {
    const code = clean.replace(/^[D|F|I|E|ES]-/i, '');
    const baseInfo = KNOWN_EXACT_CODES[code];
    const label = baseInfo
      ? `${baseInfo.city}, ${baseInfo.region} (Postal Code: ${clean.toUpperCase()})`
      : `European 5-Digit Postal Code: ${clean.toUpperCase()}`;
    return {
      raw: clean,
      recognized: true,
      postalCode: clean.toUpperCase(),
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'Europe',
      displayLabel: label,
      travelBufferMinutes: baseInfo?.buffer || 20,
    };
  }

  // 5. Portuguese Postal Code format (XXXX-XXX)
  const ptMatch = clean.match(/^(\d{4})(-\d{3})?$/);
  if (ptMatch) {
    const four = ptMatch[1];
    const baseInfo = FOUR_DIGIT_AREAS[four];
    return {
      raw: clean,
      recognized: true,
      postalCode: clean,
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'Portugal / Europe',
      displayLabel: baseInfo ? `${baseInfo.city}, ${baseInfo.region} (${clean})` : `Portuguese Postal Code: ${clean}`,
      travelBufferMinutes: 20,
    };
  }

  // 6. Polish Postal Code (XX-XXX)
  const plMatch = clean.match(/^(\d{2})-(\d{3})$/);
  if (plMatch) {
    return {
      raw: clean,
      recognized: true,
      postalCode: clean,
      stateOrCountry: 'Poland',
      displayLabel: `Polish Postal Code: ${clean}`,
      travelBufferMinutes: 20,
    };
  }

  // 7. UK Postcode (e.g. SW1A 1AA, NW1 4NP, EC2, OX1 2JD, B1 1AA, M1)
  const ukMatch = clean.match(/^[A-Z]{1,2}\d[A-Z\d]?(\s*\d[A-Z]{2})?$/i);
  if (ukMatch) {
    const baseCode = clean.split(' ')[0].toUpperCase();
    const baseInfo = KNOWN_EXACT_CODES[baseCode] || KNOWN_EXACT_CODES[upperClean];
    const label = baseInfo
      ? `${baseInfo.city}, ${baseInfo.region} (Postcode: ${upperClean})`
      : `UK Postcode: ${upperClean}`;
    return {
      raw: clean,
      recognized: true,
      postalCode: upperClean,
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'United Kingdom',
      displayLabel: label,
      travelBufferMinutes: baseInfo?.buffer || 25,
    };
  }

  // 8. Irish Eircode (e.g., D02 X285, D04, T12)
  const eirMatch = clean.match(/^([A-Z]\d{2})(\s*[A-Z0-9]{4})?$/i);
  if (eirMatch) {
    const routingKey = eirMatch[1].toUpperCase();
    const baseInfo = KNOWN_EXACT_CODES[routingKey];
    return {
      raw: clean,
      recognized: true,
      postalCode: upperClean,
      city: baseInfo?.city,
      stateOrCountry: baseInfo?.region || 'Ireland',
      displayLabel: baseInfo ? `${baseInfo.city}, ${baseInfo.region} (Eircode: ${upperClean})` : `Irish Eircode: ${upperClean}`,
      travelBufferMinutes: 20,
    };
  }

  // 9. Swedish / Czech / Slovak 5-digit with space (e.g. 111 22, 110 00)
  const spaceFiveMatch = clean.match(/^(\d{3})\s+(\d{2})$/);
  if (spaceFiveMatch) {
    return {
      raw: clean,
      recognized: true,
      postalCode: clean,
      stateOrCountry: 'Europe (Sweden / Czech / Slovakia)',
      displayLabel: `Postal Code: ${clean}`,
      travelBufferMinutes: 20,
    };
  }

  // 10. City and Country / Region combination (e.g., "Ghent, Belgium", "Antwerp, BE", "Amsterdam, Netherlands", "Paris, France", "Austin, TX")
  const parts = clean.split(',').map((s) => s.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const city = parts[0];
    const region = parts.slice(1).join(', ');
    return {
      raw: clean,
      recognized: true,
      city,
      stateOrCountry: region,
      displayLabel: `${city}, ${region}`,
      travelBufferMinutes: 20,
    };
  }

  // 11. Single City Name recognition (at least 2 alphabetic characters)
  if (parts.length === 1 && /^[a-zA-Z\u00C0-\u024F\s-]{2,}$/.test(clean)) {
    const city = parts[0];
    const upperCity = city.toUpperCase();
    const knownEuropean = KNOWN_EUROPEAN_CITIES[upperCity];
    if (knownEuropean) {
      return {
        raw: clean,
        recognized: true,
        city: knownEuropean.city,
        stateOrCountry: knownEuropean.region,
        displayLabel: `${knownEuropean.city}, ${knownEuropean.region}`,
        travelBufferMinutes: 20,
      };
    }
    return {
      raw: clean,
      recognized: true,
      city,
      displayLabel: `${city}`,
      travelBufferMinutes: 20,
    };
  }

  return {
    raw: clean,
    recognized: false,
    displayLabel: clean,
  };
}
