export type Kind = "agent" | "playbook" | "loop" | "automation";

export interface StageItem {
  kind: Kind;
  name: string;
  outcome: string;
}

export interface Stage {
  name: string;
  outcome: string;
  items: StageItem[];
}

export interface CaseStudy {
  id: string;
  tag: string;
  title: string;
  a: number;
  b: number;
  unit: string;
  metric: string;
  challenge: string;
  built: string;
  result: string[];
}

export interface GtmHomeData {
  subtitle: string;
  stages: Stage[];
  kinds: Record<Kind, string>;
  cases: CaseStudy[];
}

export const CALENDLY_URL = "https://calendly.com/theinnovativenative-info/ai-discovery-call";
