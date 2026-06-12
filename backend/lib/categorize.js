/**
 * categorize.js
 * Returns a category string for a given business name based on DB rules + builtins.
 */

const BUILTIN_RULES = [
  { category: 'dining',        patterns: ['מקדונלד','בורגר','פיצה','סושי','שוורמה','פלאפל','restoran','restaurant','bistro','cafe','קפה','coffee','starbucks','ים בר','גואה','ארומה','דומינוס','glovo','wolt','10bis','נונו','מעדנ','יין בעיר','בריוס','הארבעה','mama shelter','buzz usce','la terrasse','le grand corona','delta hospitality','amrest','frog bercy','la brioche','cafe popular','beanz','אינגה','בהאייה','אוריינט','נינג\'ה סטאר','פאפיה','דלי אסייתי','מוניציפל','דוקטור גונזו','j21','הרצל 16','the mansion','aria','rabbit','ודיע מאנה','מעדניה','pm:am'] },
  { category: 'groceries',     patterns: ['סופר','שופרסל','רמי לוי','מגה','יוחננוף','ויקטורי','טיב טעם','סטופמרקט','סיטי מרקט','מאפית','שיבולת','בול מרקט','rexail','אלונית','הכיכר','כיכר','הטחנה','מתחם 22'] },
  { category: 'household',     patterns: ['חברת החשמל','מים','גז','ארנונה','עירייה','עיריית','ועד בית','אלקטרה','סופרגז','מיה','מוטימקס','חומרי בני','א.א חומרי','המרכז לבניין','ikea','home center','הום סנטר','ace'] },
  { category: 'transport',     patterns: ['פז','yellow','דלק','סונול','פנגו','gett','uber','מוניות','רכבת','אגד','דן','נסיעות','חניון','חניוני','נאייקס','דרך ארץ','איתוראן','dott','מוסך','צ\'מפיון','דלקו','parking','מ. התחבורה','מסופונים','אחוזת החוף'] },
  { category: 'travel',        patterns: ['arkia','elal','אל על','airport','נתב"ג','נתבג','booking','airbnb','hotel','hostel','מלון','avia','flight','weezevent','airalo','ברגע האחרון','היינמן','טאטי נתבג','בליקר נתבג','beanz נתב','בנה"פ - הזמנת מט"ח','מגדל ב.בריאות ה.ק'] },
  { category: 'shopping',      patterns: ['zara','זארה','h&m','hm pl','nike','adidas','golf','מאצ\'','m&h','castro','fox','פוקס','stockxx','goat','aliexpress','amazon','ebay','celio','parinor','champs','ריטייל','keithai','loullie','iwiw','מתנות','אורבניקה','di sv','א.ד. שיווק','orinoco','א.י.מאי','מרלן','weezevent','santa clara','sarl mildis','ods france','lnb','מרכז דור','מגדלור'] },
  { category: 'health',        patterns: ['מכבי','כללית','לאומית','רופא','קופת חולים','בית מרקחת','פארמ','סופר פארם','gym','fitness','אימון','ספורט','sport','כושר','בריאות','וטרינר','dental','שיניים','הראל ביטוח','הראל-ביטוח','הראל בריאות','כלל ב.בריאות','קרן מכבי','מרחבים','גל אימבר','אור חוזר','בעין יפה','א.י.מאי בריאות'] },
  { category: 'telecom',       patterns: ['פרטנר','סלקום','hot ','bezeq','בזק','yes ','012','תקשורת','cellular','google me caller','google cloud','speechmatics'] },
  { category: 'entertainment', patterns: ['netflix','spotify','youtube','apple','google one','google play','patreon','openai','chatgpt','מפעל הפיס','קולנוע','cinema','תיאטרון','סטנד אפ','stand up','concert','הופעה','כרטיסים','mmclub','workhuman','weezevent','google youtubepremium','טעינות'] },
  { category: 'finance',       patterns: ['ביטוח','פנסיה','קרן','השקעות','ישראכרט חיוב','אלטשולר','מגדל','הראל ביטוח חיים','כלל ביטוח','בלינק','פיקדון','הלוואה','משכנתא','טפחות','פירעון','הקמת הלוואה'] },
  { category: 'kids',          patterns: ['גן ','כיתה','בית ספר','school','גנון','childcare','ילד','צעצוע','toy','lego','כפר השעשועים','shqero','גל אימבר'] },
  { category: 'pets',          patterns: ['וטרינר','pet network','limalim','לימלים','חיות מחמד'] },
  { category: 'personal',      patterns: ['קוסמטיקה','מספרה','salon','ספא','spa','beauty','נייל','nail','א.ד. שיווק מבשמים','מבשמים','perfume','זר פור יו','סלון'] },
  { category: 'rent',          patterns: ['שכירות','שכר דירה','טפחות-משכנ','משיכת שיק','הע. ל'] },
  { category: 'transfers',     patterns: ['העברה','bit','paybox','p2p'] },
];

function categorize(business, dbRules = []) {
  if (!business) return null;
  const b = business.toLowerCase().trim();

  for (const rule of dbRules) {
    if (b.includes(rule.pattern.toLowerCase())) return rule.category;
  }

  for (const { category, patterns } of BUILTIN_RULES) {
    for (const p of patterns) {
      if (b.includes(p.toLowerCase())) return category;
    }
  }

  return null;
}

module.exports = { categorize, BUILTIN_RULES };
