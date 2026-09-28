# FFMC 06 — Intranet du CA

Application React prévue pour GitHub Pages, avec connexion et données partagées dans Supabase. Aucun compte rendu ou mail privé n’est stocké dans ce dépôt public. Le modèle d’ordre du jour est générique.

## Ce qui est prêt

- Dossiers et actions : référent, statut, notes, prochaine étape, échéance.
- Réunions : ordre du jour modifiable, points importants et décisions.
- Calendrier mensuel et échéances.
- Courrier : import Gmail, analyse Gemini, classement et propositions à relire.
- Actualités privées : bilan, suivi des sujets, newsletters par mois.
- News moto & politique : fil sourcé Europe/France/Région Sud/06, nature des annonces, impact local et date des recherches. Veille horaire, écran rafraîchi chaque minute.
- Connexion par lien reçu par mail et liste des membres autorisés côté base.
- Protection contre l’écrasement d’une modification faite par un autre membre.
- Déploiement GitHub Pages via Actions.

Sans configuration Supabase, le site affiche seulement « L’espace se prépare ». Il ne prétend pas enregistrer de données et n’utilise pas de stockage local pour les dossiers.

## 1. Configurer les comptes et la base

1. Créer un projet Supabase. Choisir une région européenne si approprié. Ne pas placer de clés secrètes dans GitHub ou dans le navigateur.
2. Dans l’éditeur SQL, exécuter `supabase/schema.sql` une fois sur ce nouveau projet. Puis exécuter `supabase/roles-and-sharing.sql` une seule fois. Ces scripts créent les tables, les rôles et les règles RLS. Pour une base existante qui utilise déjà `schema.sql`, exécuter uniquement `roles-and-sharing.sql`. Ne pas désactiver RLS.
3. Dans Authentication → URL Configuration, renseigner l’URL réelle de GitHub Pages comme Site URL et URL de redirection autorisée (avec le chemin `/FFMC/` si l’adresse utilise ce chemin).
4. Dans Authentication → Users, créer ou inviter les comptes autorisés. L’intranet ne permet pas l’inscription libre. Configurer l’envoi d’emails Supabase/SMTP pour les véritables adresses des membres ; le service de test peut limiter les destinataires.
5. Ajouter chaque identifiant de compte autorisé à `public.ca_members` depuis le tableau de bord Supabase. `display_name` est facultatif. Aucun membre ne peut s’ajouter lui-même à cette liste.
6. Pour retirer un accès, supprimer la ligne correspondante dans `ca_members`. Les règles bloquent alors la lecture et les modifications suivantes. Comme pour tout document consulté, cela ne retire pas les copies déjà téléchargées.

Exemple à exécuter uniquement dans l’éditeur SQL Supabase, avec l’identifiant réel du compte :

```sql
insert into public.ca_members (user_id, display_name)
values ('UUID_DU_COMPTE', 'Prénom Nom');
```

Les comptes ont le rôle `membre` par défaut : ils peuvent seulement lire les publications actives. Le rôle `coordinateur` donne accès aux dossiers, réunions et courriers privés ainsi qu’à la gestion des publications. Il se définit uniquement dans Supabase :

```sql
update public.ca_members set role = 'coordinateur' where user_id = 'UUID_DU_COORDINATEUR';
```

Le coordinateur utilise **Partages au CA → Nouveau partage**, ou **Courrier privé → Préparer un partage au CA**. Seuls le titre et le texte explicitement publiés sont visibles par les membres. Le statut « À partager » d’un mail privé ne publie rien. Les notes et réponses privées restent dans `records`. Le bouton « Retirer du CA » masque une publication aux prochaines requêtes ; les écrans se rafraîchissent chaque minute ou avec « Actualiser ». Les copies déjà consultées ne peuvent pas être retirées. Le bouton « Voir la vue membre du CA » permet au coordinateur de prévisualiser la lecture seule. Les comptes, invitations et autorisations sont administrés dans Supabase. Pas de suppression des dossiers depuis l’application : les terminer ou archiver les mails.

## 2. Configurer GitHub Pages

Dans Settings → Secrets and variables → Actions → Variables du dépôt, ajouter :

- `VITE_SUPABASE_URL` : URL du projet Supabase.
- `VITE_SUPABASE_PUBLISHABLE_KEY` : clé **publishable** `sb_publishable_...` (ou ancienne clé publique `anon`).

Ces deux valeurs seront publiques dans le JavaScript. C’est prévu : la confidentialité repose sur la connexion des utilisateurs et les règles RLS. Ne jamais utiliser une clé `service_role` ou `sb_secret_...` ici.

Dans Settings → Pages, choisir **GitHub Actions** comme source. Une fois le code sur `main`, le workflow construit et publie le site. Une modification des variables nécessite de relancer le workflow. Utiliser l’URL indiquée par le déploiement pour configurer les redirections Supabase.

## 3. Vérification avant usage par le CA

Sur un projet de test ou avec des données fictives :

- Un visiteur non connecté ne peut pas accéder aux tables.
- Un compte connecté absent de `ca_members` ne peut ni lire ni écrire les dossiers.
- Le coordinateur peut créer et modifier les informations privées. Un membre ne peut ni les lire ni les modifier, même par requête directe.
- Un membre voit les publications actives seulement et ne peut ni publier, ni modifier un partage, ni changer son propre rôle.
- Une échéance apparaît dans le calendrier.
- Deux modifications concurrentes ne s’écrasent pas silencieusement : la deuxième saisie est conservée à l’écran avec un avertissement.
- Un membre retiré de la liste perd l’accès aux nouvelles requêtes.

Vérifier ces règles après toute modification des autorisations.

## Développement

```sh
npm ci
cp .env.example .env
# renseigner les deux valeurs publiques
npm run dev
npm run build
```

Le chemin par défaut est `/FFMC/`. La variable `PAGES_BASE_PATH` permet de le modifier ; le workflow récupère automatiquement le chemin du site GitHub Pages.

## Connexion Gmail et messagerie

Gmail est connecté côté serveur pour `coordinateur.ffmc06@gmail.com`. Le coordinateur
peut importer les mails et consulter leurs analyses privées : sujet, résumé, priorité,
points à débattre et brouillon de réponse. L’IA nécessite une clé API Gemini (Google AI Studio, offre Free) et une activation
explicite ; elle est limitée à 20 tentatives par jour. Voir `supabase/GMAIL_SETUP.md`.

Les membres du CA voient uniquement les publications relues et validées. Les brouillons
ne sont jamais envoyés automatiquement. L’accès Gmail est en lecture seule. La surveillance serveur peut fonctionner même site fermé : import toutes les cinq minutes et analyse par lots, dans les quotas disponibles. Elle se suspend depuis Courrier privé. Voir `supabase/mail-scheduler.sql`.
Les clés et jetons restent côté Supabase, jamais dans GitHub Pages.

## Références

- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- https://supabase.com/docs/guides/auth/auth-email-passwordless
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/getting-started/api-keys
