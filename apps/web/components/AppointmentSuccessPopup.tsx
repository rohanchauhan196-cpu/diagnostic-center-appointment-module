"use client";

import { CheckCircle2, Copy } from "lucide-react";

type PopupData = {
  patientName: string;
  phoneNumber: string;
  appointmentDate: string; // DD Month YYYY
  slotTime: string;
  testName: string;
  totalPrice: number;
  locationName: string;
  bookedBy: string;
  instructions: string | null;
  mapLink: string | null;
  qrCodeUrl: string | null;
  address: string | null;
  proName?: string | null;
};

interface Props {
  isOpen: boolean;
  onClose: () => void;
  data: PopupData | null;
}

export function AppointmentSuccessPopup({ isOpen, onClose, data }: Props) {
  if (!isOpen || !data) return null;

  const generateMessage = () => {
    let msg = `*Appointment Booked Successfully*\n\n`;
    msg += `Patient Name : ${data.patientName}\n`;
    msg += `Mobile Number : ${data.phoneNumber}\n`;
    msg += `Date : ${data.appointmentDate}\n`;
    msg += `Scan Time : ${data.slotTime}\n`;
    msg += `Scan Name : ${data.testName}\n`;
    msg += `Amount : ₹${data.totalPrice}\n`;
    msg += `Location : ${data.locationName}\n`;
    msg += `Booked by : ${data.bookedBy}\n`;
    
    if (data.address) {
      msg += `\n*Address*\n${data.address}\n`;
    }

    if (data.mapLink) {
      msg += `\n*Location Map Link*\n${data.mapLink}\n`;
    }

    if (data.instructions) {
      msg += `\n*Instruction Attached (as per test)*\n${data.instructions}\n`;
    }

    const pro = (data.proName || "").trim().toUpperCase();
    if (pro === "ESI") {
      msg += `\nकृपया अपने निर्धारित ईएसआई स्कैन के समय निम्नलिखित मूल दस्तावेज साथ लेकर अवश्य आएं:\n\n` +
        `* ईएसआई कार्ड\n` +
        `* ईएसआई रेफरल पत्र\n` +
        `* आधार कार्ड (मरीज एवं कार्ड धारक दोनों का)\n` +
        `* डॉक्टर द्वारा दिया गया पर्चा / संबंधित मेडिकल दस्तावेज\n` +
        `* एक हाल ही की पासपोर्ट साइज फोटो\n\n` +
        `कृपया ध्यान दें कि उपरोक्त सभी दस्तावेज लाना सभी ईएसआई मरीजों के लिए अनिवार्य है। किसी भी दस्तावेज के अभाव में आपकी जांच में देरी हो सकती है या पुनर्निर्धारित किया जा सकता है।\n\n\n\n\n` +
        `Kripya apne ESI scan ke samay niche diye gaye sabhi original documents saath lekar aayein:\n\n` +
        `* ESI Card\n` +
        `* ESI Referral Letter\n` +
        `* Aadhaar Card (Patient aur Card Holder dono ka)\n` +
        `* Doctor ka Prescription / Medical Papers\n` +
        `* Ek recent passport size photo\n\n` +
        `Yeh sabhi documents lana mandatory hai sabhi ESI patients ke liye. Agar koi document missing hua to scan delay ya reschedule ho sakta hai.\n\n` +
        `Aapke sahyog ke liye dhanyavaad.\n`;
    } else if (pro === "DAK") {
      msg += `\nDAK Patients\n\n` +
        `Please Carry All Documents:\n\n` +
        `1. ABHA ID*\n` +
        `2. DAK Form with Nodal Officer’s Sign & Stamp*\n` +
        `3. Complete KFT Report*\n` +
        `4. Patient’s Aadhaar Card / Voter ID Card*\n` +
        `5. OPD Paper / Doctor’s Prescription*\n` +
        `6. Previous PET CT Scan CD & Reports*\n` +
        `7. All Previous Medical Reports*\n\n` +
        `*कृपया सभी आवश्यक दस्तावेज़ साथ लेकर आएं:*\n\n` +
        `1. ABHA ID*\n` +
        `2. Nodal Officer के Sign एवं Stamp वाला DAK Form*\n` +
        `3. KFT की पूरी रिपोर्ट*\n` +
        `4. मरीज का Aadhaar Card / Voter ID Card*\n` +
        `5. OPD Paper / डॉक्टर की Prescription*\n` +
        `6. पिछली PET CT Scan की CD एवं Reports*\n` +
        `7. सभी पुरानी Medical Reports*\n`;
    }

    return msg;
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateMessage());
    alert("Message copied to clipboard!");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg border dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]">
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 p-6 flex flex-col items-center justify-center text-white shrink-0">
          <CheckCircle2 size={48} className="mb-2" />
          <h2 className="text-xl font-bold">Booking Confirmed</h2>
          <p className="text-green-100 text-sm opacity-90">Ready to share on WhatsApp</p>
        </div>
        
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-lg border border-slate-200 dark:border-slate-800 text-sm font-mono whitespace-pre-wrap text-slate-700 dark:text-slate-300">
            {generateMessage()}
          </div>
          
          {data.qrCodeUrl && (
            <div className="mt-4 flex flex-col items-center border rounded-lg p-4 bg-slate-50 dark:bg-slate-900">
              <span className="text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">Location QR Code</span>
              <img src={data.qrCodeUrl} alt="Location QR" className="max-w-[200px] h-auto rounded shadow-sm" />
            </div>
          )}
        </div>
        
        <div className="p-4 border-t dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200"
          >
            Close
          </button>
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-5 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md text-sm font-semibold shadow-md transition-colors"
          >
            <Copy size={16} />
            Copy for WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}
