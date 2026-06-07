import type { RadarResponse } from "@/app/api/radar/route";
import { RadarDeckHTML } from "@/app/_deck/RadarDeckHTML";
import { deriveBrief } from "@/lib/export/brief";

/**
 * Visual preview for the export deck. Renders RadarDeckHTML with a fixture
 * RadarResponse so we can iterate on slide layout without re-running the
 * agent + GrantGuru pipeline. Not linked from the main UI.
 *
 * Visit /dev/deck-preview in development to see the deck.
 */

const FIXTURE: RadarResponse = {
  parent: {
    name: "Chick-fil-A, Inc.",
    type: "corporation",
    description:
      "Atlanta-based privately-held quick-service restaurant chain. Anchors a multi-entity philanthropic footprint that includes a corporate foundation, the founding Cathy family's nonprofit umbrella, and a separately-incorporated nonprofit serving leadership programs.",
    givingPrograms: [
      "True Inspiration Awards",
      "Community Care",
      "Youth Leadership",
      "WinShape College Program",
    ],
    headquarters: "Atlanta, GA",
  },
  summary:
    "Chick-fil-A operates three structurally-tied nonprofits: the Chick-fil-A Foundation (its corporate giving arm), WinShape Foundation (the Cathy family's nonprofit umbrella covering camps, marriage retreats, and college programs), and LifeShape Foundation (focused on leadership development). All three share board ties to the Cathy family and operate within the same Atlanta-area philanthropic orbit.",
  nonprofits: [
    {
      name: "Chick-fil-A Foundation",
      mission:
        "Caring for young people through education, mentorship, and the development of leadership skills — investing in programs that equip the next generation to thrive.",
      programs: ["Youth education", "Leadership development", "Mentorship", "Food security"],
      populations: ["Youth", "Underserved students"],
      location: { city: "Atlanta", state: "GA", country: "US" },
      relationship: "Chick-fil-A, Inc.'s corporate foundation, founded in 2012.",
      connectionType: "corporate_foundation",
      grants: {
        status: "ok",
        qualifiedCount: 5,
        rawCount: 10,
        cappedAtLimit: false,
        top: [
          {
            guid: "fixture-1",
            programName: "21st Century Community Learning Centers",
            agency: "U.S. Department of Education",
            fundingDisplay: "$1,200,000",
            closingDateDisplay: "Mar 14, 2026",
            closingInfo: null,
            difficulty: "Doable",
            competitive: true,
            url: "https://grantguru.com/grants/fixture-1",
            matchScore: 84,
            matchQuality: "excellent",
          },
          {
            guid: "fixture-2",
            programName: "Promise Neighborhoods",
            agency: "U.S. Department of Education",
            fundingDisplay: "$30,000,000",
            closingDateDisplay: "Apr 22, 2026",
            closingInfo: null,
            difficulty: "Might Need Help",
            competitive: true,
            url: "https://grantguru.com/grants/fixture-2",
            matchScore: 78,
            matchQuality: "good",
          },
          {
            guid: "fixture-3",
            programName: "Full-Service Community Schools",
            agency: "U.S. Department of Education",
            fundingDisplay: "$2,500,000",
            closingDateDisplay: "May 10, 2026",
            closingInfo: null,
            difficulty: "Doable",
            competitive: true,
            url: null,
            matchScore: 71,
            matchQuality: "good",
          },
          {
            guid: "fixture-4",
            programName: "Mentoring for Youth Affected by the Opioid Crisis",
            agency: "Department of Justice",
            fundingDisplay: "$750,000",
            closingDateDisplay: "Jun 30, 2026",
            closingInfo: null,
            difficulty: null,
            competitive: null,
            url: null,
            matchScore: 63,
            matchQuality: "possible",
          },
          {
            guid: "fixture-5",
            programName: "GEAR UP Partnership Grants",
            agency: "U.S. Department of Education",
            fundingDisplay: "$3,500,000",
            closingDateDisplay: "Jul 18, 2026",
            closingInfo: null,
            difficulty: "Might Need Help",
            competitive: true,
            url: null,
            matchScore: 55,
            matchQuality: "possible",
          },
        ],
      },
    },
    {
      name: "WinShape Foundation",
      mission:
        "Strengthening families and communities through camps, marriage enrichment, and college leadership programs — investing in the next generation of servant leaders.",
      programs: ["Camps", "Marriage retreats", "College scholarship", "Leadership development"],
      populations: ["Families", "College students"],
      location: { city: "Mount Berry", state: "GA", country: "US" },
      relationship:
        "The Cathy family's nonprofit umbrella, founded by Truett Cathy in 1984 on the campus of Berry College.",
      connectionType: "family_foundation",
      grants: {
        status: "ok",
        qualifiedCount: 3,
        rawCount: 8,
        cappedAtLimit: false,
        top: [
          {
            guid: "fixture-6",
            programName: "Strengthening Families Program",
            agency: "Health and Human Services",
            fundingDisplay: "$500,000",
            closingDateDisplay: "Feb 28, 2026",
            closingInfo: null,
            difficulty: "Doable",
            competitive: false,
            url: null,
            matchScore: 82,
            matchQuality: "excellent",
          },
          {
            guid: "fixture-7",
            programName: "Healthy Marriage and Responsible Fatherhood",
            agency: "Health and Human Services",
            fundingDisplay: "$1,500,000",
            closingDateDisplay: "Mar 15, 2026",
            closingInfo: null,
            difficulty: "Might Need Help",
            competitive: true,
            url: null,
            matchScore: 76,
            matchQuality: "good",
          },
          {
            guid: "fixture-8",
            programName: "Federal TRIO — Upward Bound",
            agency: "U.S. Department of Education",
            fundingDisplay: "$300,000",
            closingDateDisplay: "Apr 4, 2026",
            closingInfo: null,
            difficulty: "Doable",
            competitive: true,
            url: null,
            matchScore: 64,
            matchQuality: "possible",
          },
        ],
      },
    },
    {
      name: "LifeShape Foundation",
      mission:
        "Developing principled leaders through immersive cohort experiences focused on character, calling, and community.",
      programs: ["Leadership development", "Cohort programming", "Mentorship"],
      populations: ["Emerging leaders"],
      location: { city: "Atlanta", state: "GA", country: "US" },
      relationship:
        "A separately-incorporated nonprofit founded by Dan Cathy in 2016, operating in close coordination with WinShape.",
      connectionType: "family_foundation",
      grants: {
        status: "ok",
        qualifiedCount: 2,
        rawCount: 6,
        cappedAtLimit: false,
        top: [
          {
            guid: "fixture-9",
            programName: "Corporation for National and Community Service — AmeriCorps",
            agency: "AmeriCorps",
            fundingDisplay: "$450,000",
            closingDateDisplay: "May 1, 2026",
            closingInfo: null,
            difficulty: "Doable",
            competitive: true,
            url: null,
            matchScore: 67,
            matchQuality: "good",
          },
          {
            guid: "fixture-10",
            programName: "Workforce Innovation and Opportunity Act — Youth",
            agency: "Department of Labor",
            fundingDisplay: "$1,000,000",
            closingDateDisplay: "Jun 15, 2026",
            closingInfo: null,
            difficulty: "Might Need Help",
            competitive: true,
            url: null,
            matchScore: 58,
            matchQuality: "possible",
          },
        ],
      },
    },
  ],
};

export default function DeckPreviewPage() {
  const brief = deriveBrief(FIXTURE, "2026-06-07T00:00:00.000Z");
  return <RadarDeckHTML brief={brief} />;
}
