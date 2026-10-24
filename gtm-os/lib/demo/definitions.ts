export type Definition = { term: string; meaning: string; owner: string };

export const DEFINITIONS: Definition[] = [
  { term: "Leads", meaning: "Every new inquiry recorded in the CRM that day, from any source.", owner: "Marketing lead" },
  { term: "Appointments set", meaning: "Leads that booked an in-home appointment.", owner: "Sales lead" },
  { term: "Appointments issued", meaning: "Booked appointments that were handed to a rep to run.", owner: "Sales lead" },
  { term: "Set rate", meaning: "Appointments set ÷ leads, over the same days.", owner: "Sales lead" },
  { term: "Connect rate", meaning: "Connected calls ÷ dials, from the CRM's call log.", owner: "Sales lead" },
  { term: "Close rate", meaning: "Sales ÷ issued appointments.", owner: "Sales lead" },
  { term: "Cost per lead", meaning: "All ad spend ÷ leads.", owner: "Marketing lead" },
  { term: "Cost per set", meaning: "All-in ad spend ÷ appointments set.", owner: "Marketing lead" },
  { term: "MER", meaning: "Revenue ÷ ad spend, shown as a multiple such as 4.8x.", owner: "Marketing lead" },
  { term: "Ad spend as a share of revenue", meaning: "Ad spend ÷ revenue, shown as a percent. It is MER turned upside down.", owner: "Marketing lead" },
  { term: "Revenue per marketing dollar", meaning: "Net revenue ÷ all-in marketing cost, which adds agency fees, tools and offline media to ad spend.", owner: "Marketing lead" },
  { term: "Net revenue", meaning: "Gross revenue minus cancels, counted in the month of the cancel.", owner: "Finance lead" },
  { term: "Marketing cost target", meaning: "All-in marketing cost ÷ net revenue, against a 28 percent target.", owner: "Marketing lead" },
  { term: "Net revenue per issued appointment", meaning: "Net revenue ÷ issued appointments.", owner: "Sales lead" },
  { term: "AI answered share", meaning: "Questions the AI answered itself ÷ questions asked, over the same days.", owner: "Operations lead" },
];
