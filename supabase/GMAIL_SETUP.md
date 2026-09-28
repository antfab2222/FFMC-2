# Connexion Gmail FFMC06

Boîte autorisée : coordinateur.ffmc06@gmail.com. L’utilisateur Supabase conserve
son compte coordinateur actuel. Cette connexion ne change pas son adresse de connexion.

## Installation serveur

1. Appliquer `gmail-connection.sql` une fois après `roles-and-sharing.sql`.
2. Déployer `functions/gmail-connect/index.ts` et `crypto.ts`, avec `verify_jwt=false`.
   La fonction vérifie elle-même le JWT et le rôle coordinateur pour chaque POST.
   Le retour Google utilise un état aléatoire à usage unique, expirant après 10 minutes.
3. Dans Supabase → Edge Functions → Secrets, ajouter `GOOGLE_CLIENT_SECRET`.
   Valeur : le secret du client OAuth **FFMC06 – Connexion Gmail**.
   Ne pas le placer dans GitHub, un préfixe VITE_, une capture ou un message de chat.
   L’ID client public est déjà configuré dans la fonction.

## Google Cloud

Dans le client OAuth Web, conserver l’origine `https://antfab2222.github.io`.
Ajouter exactement cette URI de redirection autorisée :

```
https://hojiveehwtazeqiymnwg.supabase.co/functions/v1/gmail-connect
```

Activer Gmail API et déclarer le niveau d’accès `https://www.googleapis.com/auth/gmail.readonly`.
Si l’application est en test, ajouter `coordinateur.ffmc06@gmail.com` aux utilisateurs test
(Google Auth Platform → Audience). Respecter les exigences Google applicables avant la mise en production.

Dans l’intranet, ouvrir **Courrier privé → Connecter Gmail**, puis choisir cette boîte
et autoriser la lecture. Une autre boîte est refusée. La connexion n’envoie aucun mail
et ne modifie pas les messages Gmail.

## Protection et limites

Les jetons de renouvellement sont chiffrés avec AES-GCM et une clé dérivée du secret OAuth
via HKDF. Ce secret reste dans les secrets des fonctions, séparé de la base.
Une rotation du secret OAuth nécessite une nouvelle connexion Gmail.
Les deux tables de connexion n’accordent aucun accès à `anon` ou `authenticated`.
Aucun jeton Google ne revient dans le navigateur ni dans les publications au CA.
Pour révoquer l’accès, utiliser les connexions tierces du compte Google.

## Import et analyse privée

Appliquer `mail-assistant.sql` une fois, puis déployer `functions/mail-assistant/index.ts`
avec `content.ts` et `../gmail-connect/crypto.ts`, `verify_jwt=false` (authentification vérifiée dans la fonction : JWT coordinateur ou jeton de tâche à usage unique).
Le serveur vérifie aussi la session et le rôle coordinateur pour chaque action.

Dans **Courrier privé**, cliquer **Importer les mails**. Le premier import couvre les
30 derniers jours, par pages de 50. Continuer avec **Importer la page suivante** si proposé.
Les imports suivants récupèrent les nouveaux échanges avec un chevauchement d’un jour ;
les identifiants Gmail empêchent les doublons. Les pièces jointes ne sont pas téléchargées.
Le texte conservé est limité à 30 000 caractères par mail ; les extraits tronqués sont signalés.

Pour activer l’IA, ajouter dans Supabase → Edge Functions → Secrets :

- `GEMINI_API_KEY` : une clé API Google AI Studio du projet en offre Free.
- `MAIL_AI_ENABLED` : `true` pour activer explicitement l’analyse Gemini.

Ne jamais mettre la clé dans GitHub, une variable VITE_, une capture ou le chat.
Conserver le projet Google AI Studio en offre Free, sans activer Cloud Billing. Le site ne peut pas vérifier le statut de facturation du projet : si la facturation est activée chez Google, des frais sont possibles. Les quotas gratuits sont ceux du projet et peuvent varier. Aucun repli vers OpenAI ou autre fournisseur payant.
Supprimer le drapeau ou le passer à `false` désactive l’analyse sans bloquer l’import.

Le modèle `gemini-3.5-flash-lite` reçoit le sujet, l’expéditeur, la date, jusqu’à
12 000 caractères du mail et deux échanges antérieurs importés (2 000 caractères chacun).
Le texte des mails est transmis à Google Gemini seulement
lorsque l’analyse est activée et lancée. Plafond serveur : 20 tentatives par jour UTC,
y compris les erreurs. Les propositions restent privées et doivent être vérifiées.

Les filtres regroupent les sujets et les actions proposées : À débattre, À répondre,
À partager, Pour information. Préparer un dossier ou un partage ouvre un formulaire
à relire et valider. Aucun mail n’est envoyé, aucune publication n’est automatique.
La surveillance serveur utilise pg_cron et pg_net. Appliquer `mail-scheduler.sql` après
`mail-assistant.sql`, déployer la fonction actualisée puis activer depuis Courrier privé.
Import toutes les cinq minutes ; analyse deux minutes après, par lots de trois.
Les imports historiques sont paginés à raison d’une page par passage.
Le compteur reste limité à 20 tentatives/jour UTC. Le bouton Suspendre arrête les prochains
passages ; un traitement déjà démarré peut finir. Le service dépend de la disponibilité
Supabase/Google et d’une autorisation Gmail valide ; ce n’est pas une garantie de délai.

Chaque appel planifié utilise un jeton aléatoire 256 bits, limité à une action, expirant
en cinq minutes et consommé atomiquement. Seule son empreinte reste en base. La table
est réservée au serveur, et la fonction SQL d’envoi est réservée au propriétaire postgres.
La fonction Edge revérifie le rôle du coordinateur ayant connecté Gmail. Aucun secret
permanent n’est présent dans le code ou le texte des tâches cron.
Les erreurs Gemini suspendent les analyses automatiques une heure (24 heures pour 402).
Corriger la clé puis lancer une analyse manuelle permet de lever la pause si elle réussit.
L’erreur est affichée dans Courrier privé. L’import continue pendant la pause de l’IA.
L’historique technique de ces tâches est conservé une semaine.

## Vérifications

`npm run build`, `node tests/gmail-security.mjs` et `node tests/mail-content.mjs`.
Tester ensuite avec le coordinateur : import, pagination, absence de doublons, activation
IA et relecture. Vérifier qu’un membre du CA ne peut lire `ca_mail_messages`, même par API.
Les tables de connexion et de consommation IA restent accessibles au serveur seulement.

Le compteur quotidien existant est conservé lors du passage à Gemini, y compris les tentatives OpenAI précédentes. La clé OPENAI_API_KEY n’est plus utilisée et peut être supprimée des secrets.

Le schéma interne `net` de pg_net ne doit pas être ajouté aux schémas exposés de la Data API. Sa file HTTP contient temporairement le jeton limité à une seule tâche (aucune clé service_role permanente). Les tables pg_net sont gérées par Supabase.

## Actualités et reprise de l’historique

Appliquer `news-and-review.sql`, puis `news-mail-updates.sql`, après les migrations précédentes.
Déployer ensuite la version courante de mail-assistant (index.ts, content.ts, gemini.ts et crypto.ts).
`reviewed_at` exclut de Gemini les messages déjà examinés dans un bilan humain.
Une reprise historique se fait côté administrateur : régler la borne de synchronisation,
laisser finir la pagination, rédiger le bilan privé puis marquer uniquement les IDs examinés.
Ne jamais stocker de mail, rapport privé ou identifiant de connexion dans le dépôt public.

Actualités comporte le bilan, le suivi, les newsletters filtrables par mois et la veille web.
Les analyses de nouveaux mails importants ou proposant une action créent une entrée datée
avec le lien Gmail. Le déclencheur SQL est transactionnel et déduplique par ID du mail ;
il ne remplace pas les notes humaines. Les fiches se modifient avec contrôle de concurrence.
Les publications au CA nécessitent toujours une relecture et une validation.

La recherche web est une tâche ChatGPT distincte du cron Gmail, programmée toutes les heures.
Elle ajoute seulement les nouveautés sourcées dans ca_news_items, avec des clés stables par
source et événement, sans écraser les fiches existantes. Appliquer aussi news-feed.sql.
Le fil News moto & politique propose des filtres Europe, France, Région Sud et Alpes-Maritimes.
ca_news_watch conserve la date et le résultat de la dernière recherche, même sans nouveauté.
Le navigateur recharge le fil chaque minute lorsqu’il est visible ; cela ne lance pas une
nouvelle recherche et ne constitue pas du temps réel instantané. Au-delà de trois heures
sans recherche utile, l’interface signale une actualisation à vérifier. Elle dépend du
maintien des accès de la tâche à Supabase et à la recherche web. Sa pause se gère dans les
tâches ChatGPT ; Suspendre dans Courrier privé concerne uniquement l’import et Gemini.
Les recherches ne doivent pas présenter une proposition associative comme une loi adoptée.

Test de la confidentialité et des mises à jour : `tests/news-access.sql` dans une transaction
administrateur (fixtures annulées par ROLLBACK). Aucun appel Gemini n’est nécessaire au test.
