export const USG_SUB_TESTS = [
  "USG GUIDED PROCEDURE (FNAC, ASPIRATION etc.)",
  "USG KUB",
  "USG Lower Abdomen (TVS)",
  "USG Lower Abdomen",
  "USG NECK",
  "USG Bilateral Breast",
  "USG CHEST",
  "Ultrasound Head",
  "Ultrasound Parotid Gland",
  "Ultrasound Prostate",
  "Ultrasound Eye or Orbit",
  "USG Scrotum",
  "USG Thyroid",
  "Ultrasound Upper Abdomen",
  "Ultrasound Whole Abdomen",
  "Ultrasound Whole Abdomen + TVS",
  "X-ray Mammography",
];

export const USG_SPECIAL_STUDY_SUB_TESTS = [
  "Ultrasound Upper Abdomen with Pregnancy",
  "USG LEVEL-2 (TWINS)",
  "USG OBS WITH TWINS",
  "USG OBS WITH NT, NB SCAN",
  "USG OBS - 3D/4D USG",
  "COLOUR DOPPLER - (ART & VENOUS) LOWER LIMB (SINGLE LIMB)",
  "COLOUR DOPPLER - (ART & VENOUS) UPPER LIMB (SINGLE LIMB)",
  "COLOUR DOPPLER - BOTH LOWER LIMBS ARTERIAL",
  "COLOUR DOPPLER - BOTH LOWER LIMBS VENOUS",
  "COLOUR DOPPLER - BOTH UPPER LIMBS ARTERIAL",
  "COLOUR DOPPLER - BOTH UPPER LIMBS VENOUS",
  "COLOUR DOPPLER - LOWER LIMB VENOUS",
  "COLOUR DOPPLER - UPPER LIMB VENOUS",
  "COLOUR DOPPLER - BOTH LOWER LIMBS - (ART & VEIN)",
  "COLOUR DOPPLER - BOTH UPPER LIMBS - (ART & VEIN)",
  "COLOUR DOPPLER - LOWER LIMB ARTERIAL",
  "COLOUR DOPPLER - UPPER LIMB ARTERIAL",
  "COLOR DOPPLER - ABDOMEN",
  "COLOR DOPPLER - CAROTIDS",
  "COLOR DOPPLER - HEAD",
  "COLOR DOPPLER - PELVIS",
  "COLOR DOPPLER - Scrotum",
  "COLOR DOPPLER RENAL",
  "USG FOLLICULAR STUDIES",
  "USG FOLLICULAR STUDY SINGLE SETTING",
  "USG OBS.- LEVEL II / ANOMALY SCAN",
  "USG OBS.- LEVEL I / NT-NB SCAN",
  "USG OBS NT-NB with Twins",
  "USG Color Doppler Obstetric",
  "USG OBSTETRICAL/FETAL WELL BEING",
  "USG SCROTUM",
  "USG COLOUR DOPPLER SCROTUM",
  "ULTRASOUND SOFT PARTS",
];

export function isUsgSpecialStudy(testName?: string | null): boolean {
  if (!testName) return false;
  const name = testName.toLowerCase();
  return (name.includes("usg") || name.includes("ultrasound")) && name.includes("special");
}

export function isUsgTest(testName?: string | null): boolean {
  if (!testName) return false;
  const name = testName.toLowerCase();
  return name.includes("usg") || name.includes("ultrasound");
}

export function getUsgSubTestOptions(testName?: string | null): string[] {
  if (!testName) return [];
  if (isUsgSpecialStudy(testName)) {
    return USG_SPECIAL_STUDY_SUB_TESTS;
  }
  if (isUsgTest(testName)) {
    return USG_SUB_TESTS;
  }
  return [];
}
