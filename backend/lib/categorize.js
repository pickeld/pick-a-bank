/**
 * categorize.js
 * Returns a category string for a given business name based on DB rules + builtins.
 */

const BUILTIN_RULES = [
  { category: 'dining',        patterns: ['מקדונלד','בורגר','פיצה','סושי','שוורמה','פלאפל','restoran','restaurant','bistro','cafe','קפה','coffee','starbucks','ים בר','גואה','ארומה','דומינוס','glovo','wolt','10bis','נונו','מעדנ','יין בעיר','בריוס','הארבעה','mama shelter','buzz usce','la terrasse','le grand corona','delta hospitality','amrest','frog bercy','la brioche','cafe popular','beanz','אינגה','בהאייה','אוריינט','נינג\'ה סטאר','פאפיה','דלי אסייתי','מוניציפל','דוקטור גונזו','j21','הרצל 16','the mansion','aria','rabbit','ודיע מאנה','מעדניה','pm:am','מתוק','סוויט פיקס','רובינא','יקב קסטל','בזאר המשקאות','טבקו','ששת','פארקר','aerodrom','sas ks','clement','fiquet','a.k.a'] },
  { category: 'groceries',     patterns: ['סופר','שופרסל','רמי לוי','מגה','יוחננוף','ויקטורי','טיב טעם','סטופמרקט','סיטי מרקט','מאפית','שיבולת','בול מרקט','rexail','אלונית','הכיכר','כיכר','הטחנה','מתחם 22','fresh market','טבע האדם','פרי טיוי','max 20','מקס כפר'] },
  { category: 'household',     patterns: ['חברת החשמל','מים','גז','ארנונה','עירייה','עיריית','ועד בית','אלקטרה','סופרגז','מיה','מוטימקס','חומרי בני','א.א חומרי','המרכז לבניין','ikea','home center','הום סנטר','ace','עירית'] },
  { category: 'transport',     patterns: ['פז','yellow','דלק','סונול','פנגו','gett','uber','מוניות','רכבת','אגד','דן','נסיעות','חניון','חניוני','נאייקס','דרך ארץ','איתוראן','dott','מוסך','צ\'מפיון','דלקו','parking','מ. התחבורה','מסופונים','אחוזת החוף','סנטרל פארק','השכרת מתקני חוף'] },
  { category: 'travel',        patterns: ['arkia','elal','אל על','airport','נתב"ג','נתבג','booking','airbnb','hotel','hostel','מלון','avia','flight','weezevent','airalo','ברגע האחרון','היינמן','טאטי נתבג','בליקר נתבג','beanz נתב','בנה"פ - הזמנת מט"ח','מגדל ב.בריאות ה.ק','טוונטי פור סבן','24/7','twenty four'] },
  { category: 'shopping',      patterns: ['zara','דלתא פלוס','דקאתלון','זארה','h&m','hm pl','nike','adidas','golf','מאצ\'','m&h','castro','fox','פוקס','stockxx','goat','aliexpress','amazon','ebay','celio','parinor','champs','ריטייל','keithai','loullie','iwiw','מתנות','אורבניקה','di sv','א.ד. שיווק','א.י.מאי','מרלן','santa clara','sarl mildis','ods france','lnb','מרכז דור','מגדלור','וואלה!שופס','שופנדה','di as vi','מירקוביץ','mirkovic','קוני','אלומה','זו ארץ','aigy','איי גי','די אס וי'] },
  { category: 'health',        patterns: ['מכבי','כללית','לאומית','רופא','קופת חולים','בית מרקחת','פארמ','סופר פארם','gym','fitness','אימון','ספורט','sport','כושר','בריאות','וטרינר','dental','שיניים','הראל ביטוח','הראל-ביטוח','הראל בריאות','כלל ב.בריאות','קרן מכבי','מרחבים','גל אימבר','אור חוזר','בעין יפה','א.י.מאי בריאות','בי דראגסטור','drugstore'] },
  { category: 'telecom',       patterns: ['פרטנר','סלקום','hot ','bezeq','בזק','yes ','012','תקשורת','cellular','google me caller','google cloud','speechmatics','google*cloud'] },
  { category: 'entertainment', patterns: ['netflix','קינג קונג','spotify','youtube','apple','google one','google play','patreon','openai','chatgpt','מפעל הפיס','קולנוע','cinema','תיאטרון','סטנד אפ','stand up','concert','הופעה','כרטיסים','mmclub','workhuman','google youtubepremium','טעינות','מל מסיבה','רדיו גליל','סוויפט הוד','ז\'לינסקי','weezevent','הטבות פיס'] },
  { category: 'finance',       patterns: ['ביטוח','משיכת מזומנים','פנסיה','קרן','השקעות','ישראכרט חיוב','אלטשולר','מגדל','הראל ביטוח חיים','כלל ביטוח','בלינק','פיקדון','הלוואה','משכנתא','טפחות','פירעון','הקמת הלוואה','תשלום מס','ריבית','קבלת תשלום','קנייה בה.קבע','איביאי','סיסקו סיסט'] },
  { category: 'kids',          patterns: ['גן ','כיתה','בית ספר','school','גנון','childcare','ילד','צעצוע','toy','lego','כפר השעשועים','shqero','גל אימבר','קיטו מרום'] },
  { category: 'pets',          patterns: ['וטרינר','pet network','limalim','לימלים','לימלימ','חיות מחמד'] },
  { category: 'personal',      patterns: ['קוסמטיקה','מספרה','salon','ספא','spa','beauty','נייל','nail','א.ד. שיווק מבשמים','מבשמים','perfume','זר פור יו','סלון','יוסי יונתי','עיצוב שי'] },
  { category: 'rent',          patterns: ['שכירות','שכר דירה','טפחות-משכנ','משיכת שיק','הע. ל'] },
  { category: 'transfers',     patterns: ['העברה','bit','paybox','p2p','פיס פלוס'] },
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
