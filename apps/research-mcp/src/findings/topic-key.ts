/**
 * A topic key as the privacy screen reads it (review finding 4): the key, then its words, with each . and _, and each
 * dash not between two digits, read as a space. The Atlas keeps a topic's key for good (topics are never erased), and
 * one joined token hides from the screen what its parts hold, such as 555_867_5309; a dash between digits stays, so a
 * year range such as 2019-2024 is still set aside as one, and the key itself stays for the card-reference guard.
 *
 * A module of its own, importing nothing: Atlas Release B's reading reads a topic's key the same way (Codex's final
 * pass of B), and importing the card module from the pages' modules would make an import cycle.
 */
export function topicKeyText(key: string): string {
  return `${key} ${key.replace(/[._]|-(?!\p{Nd})|(?<!\p{Nd})-/gu, " ")}`;
}
