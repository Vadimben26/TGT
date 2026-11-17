# TGT — cours de padel pour l'IE Ségovie

Le site affiche les créneaux de 60 ou 90 min où **un coach est libre** (son Google Calendar) **et** où **au moins un terrain de Padelzone 2.0 est libre** (lu sur le système de réservation Taykus du club). L'élève clique sur « Book », WhatsApp s'ouvre avec un message pré-rempli pour Lazslo, Lazslo réserve sur Taykus, puis l'élève le paie par Bizum ou virement.

```
public/index.html        le site (Home · Lessons · Tournament)
api/availability.js      la fonction serveur (Vercel) → /api/availability
lib/availability.js      la logique : Taykus + Google Calendar → créneaux
config.js                réglages (coachs, tournoi, délai minimum…)
server.js                pour lancer en local : npm start
test/                    tests hors ligne : npm test
```

## 1. Récupérer le lien d'agenda de chaque coach

Pour chaque coach (Lazslo maintenant, Carlos plus tard), sur **ordinateur** :

1. Ouvrir Google Calendar → ⚙️ **Paramètres**.
2. À gauche, cliquer sur son agenda (sous « Paramètres de mes agendas »).
3. Section **Intégrer l'agenda** → copier **« Adresse secrète au format iCal »** (se termine par `basic.ics`).

Ce lien est secret : il ne va jamais dans le code, seulement dans les variables d'environnement (étape 3).

### Deux façons de remplir l'agenda (au choix de chaque coach)
- **Mode « occupé » (par défaut)** : le coach met juste ses rendez-vous dans son agenda. Le site considère qu'il est disponible pendant ses heures de travail (`workingHours` dans `config.js` : actuellement **lundi–samedi 9h–22h, dimanche off** — à ajuster) sauf pendant ses événements.
- **Mode « dispo »** : si l'agenda contient au moins un événement nommé **Dispo** (ou *Disponible*, *Available*, *Libre*), le site n'affiche **que** des créneaux à l'intérieur de ces événements. Plus précis, recommandé si le coach a des horaires irréguliers.

Un événement marqué « Disponible » (transparent) dans Google n'est pas compté comme occupé.

## 2. Mettre en ligne (Vercel, gratuit)

1. Créer un compte sur github.com et vercel.com.
2. Mettre ce dossier dans un nouveau dépôt GitHub (bouton « Add file → Upload files » suffit).
3. Sur Vercel : **Add New → Project → importer le dépôt** → Framework : *Other* → **Deploy**.
4. Dans le projet Vercel → **Settings → Environment Variables**, ajouter :
   | Nom | Valeur |
   |---|---|
   | `CAL_LAZSLO` | l'adresse iCal secrète de Lazslo |
   | `CAL_CARLOS` | celle de Carlos (quand vous l'avez) |
   | `LAZSLO_WHATSAPP` | numéro de Lazslo au format international, ex. `34612345678` |
5. **Deployments → ⋯ → Redeploy** pour prendre en compte les variables.

➡️ **Ajouter Carlos plus tard = juste ajouter `CAL_CARLOS` puis Redeploy.** Rien d'autre à changer. Tant qu'il n'est pas ajouté, le site affiche « Availability coming soon » pour lui.

Optionnel : acheter un nom de domaine et le relier dans Vercel → Settings → Domains.

## 3. Le tournoi

Chaque mois, Lazslo modifie le bloc `tournament` dans `config.js` (date, heure de check-in, prix par paire). Tant que c'est `null`, le site affiche « TBA ». Les inscriptions arrivent sur son WhatsApp.

## 4. Lancer en local (pour tester)

```bash
npm install
cp .env.example .env    # puis remplir .env
npm start               # http://localhost:3000
npm test                # tests avec données simulées
```

## Comment marche la lecture des terrains (et ses limites)

`lib/availability.js` appelle `https://padelzone.taykus.com/api/publicbookings/list` (la même requête que la page de réservation publique du club, sans compte) pour chacun des 7 prochains jours, avec `bookingTypeId: 12` (« Reserva Pista »). Taykus renvoie, pour chacune des 8 pistes, les heures de début libres et leur durée (90 min).

- **Ce n'est pas une API officielle.** Si Taykus la change, le site affiche un message « Court availability… partly unavailable » au lieu de planter. Il faudra alors adapter `fetchCourtsForDay`.
- Le résultat est mis en cache **5 minutes** → un terrain peut être pris entre-temps ; Lazslo vérifie de toute façon en réservant.
- Faites-le avec l'accord de Padelzone, et à terme demandez-leur un accès officiel à Taykus.

Tarifs dans `config.js` → `prices` (€/heure/personne : 1 → 50, 2 → 30, 3 → 25, 4 → 20 ; −30 % premier cours). Durées proposées : `club.lessonDurations` (60 et 90 min).

Réglages utiles dans `config.js` : `minNoticeHours` (délai minimum avant un créneau, 3 h), `slotStepMinutes` (créneaux toutes les 30 min), `daysAhead` (7 jours).
