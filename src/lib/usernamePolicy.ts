const leetMap: Record<string, string> = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's',
}

const compactUsername = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[0134578@$]/g, char => leetMap[char] || char)
  .replace(/[^a-z0-9]/g, '')

const prohibitedTerms = [
  'motherfucker', 'motherfuck', 'asshole', 'arsehole', 'bullshit', 'fuck', 'shit', 'bitch', 'bastard',
  'cunt', 'pussy', 'whore', 'slut', 'faggot', 'nigger', 'nigga', 'kike', 'chink', 'spic', 'wetback',
  'tranny', 'dyke', 'kurva', 'fasz', 'geci', 'picsa', 'kocsog', 'buzi', 'bazd', 'baszd', 'szar',
  'scheisse', 'arschloch', 'hurensohn', 'mierda', 'puta', 'cabron', 'joder', 'putain', 'connard',
  'blyat', 'suka', 'khuy', 'pizda', 'heilhitler', 'whitepower', 'whitepride', 'aryannation',
  'isil', 'daesh', 'alqaeda', 'alqaida',
]
const roleTerms = [
  'administrator', 'admin', 'moderator', 'modteam', 'staff', 'employee', 'official', 'verified',
  'developer', 'devteam', 'security', 'representative', 'owner',
]

export type UsernamePolicyResult = { valid: true } | { valid: false; reason: string }

export function validateUsernamePolicy(value: string): UsernamePolicyResult {
  const username = value.trim()
  if (!/^[A-Za-z0-9_]{3,24}$/.test(username)) {
    return { valid: false, reason: 'Use 3–24 characters with only letters, numbers, and underscores.' }
  }
  const normalized = compactUsername(username)
  if (prohibitedTerms.some(term => normalized.includes(term))) {
    return { valid: false, reason: 'This username contains a prohibited offensive, hateful, or extremist term.' }
  }
  if (normalized.startsWith('isis') || normalized === 'kkk') {
    return { valid: false, reason: 'This username contains a prohibited extremist organization reference.' }
  }
  const brand = /(uflmb|ufl|strikerz)/.test(normalized)
  const role = roleTerms.some(term => normalized.includes(term))
  const supportRole = normalized.endsWith('support') && !normalized.includes('supporter')
  if (brand && (role || supportRole)) {
    return { valid: false, reason: 'Fan names are allowed, but usernames must not imply official, admin, staff, or employee status.' }
  }
  const rawCompact = username.toLowerCase().replace(/[^a-z0-9]/g, '')
  if (/^(administrator|admin|moderator|modteam|staff|employee|official|verified|developer|devteam|security|representative|owner)[0-9]*$/.test(rawCompact)) {
    return { valid: false, reason: 'Usernames that imply administrator, official, staff, or employee status are not allowed.' }
  }
  return { valid: true }
}
