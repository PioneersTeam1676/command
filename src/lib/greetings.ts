const GREETINGS = [
  "Howdy",
  "Hey",
  "Hello",
  "Hi there",
  "Hi",
  "What's up",
  "How's it going",
  "Glad you're here",
  "Ahoy",
  "Hola",
  "Bonjour",
  "Beep boop",
  "Sup",
  "Greetings",
  "Heyo",
  "Salutations",
  "Ready when you are",
  "At your service",
  "Fancy seeing you here",
  "Good to see you",
  "Look who it is",
  "Hello hello",
  "What's cookin'",
  "How goes it",
  "Aloha",
];

const BY_TIME = { morning: "Good morning", afternoon: "Good afternoon", evening: "Good evening" } as const;

/** A random home-screen greeting. The time-of-day ones only appear at the right time (`hour` is 0-23 in the team's timezone). */
export function pickGreeting(hour: number, rand: () => number = Math.random): string {
  const part = hour < 5 ? null : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 22 ? "evening" : null;
  const pool = part ? [...GREETINGS, BY_TIME[part]] : GREETINGS;
  return pool[Math.floor(rand() * pool.length)]!;
}
