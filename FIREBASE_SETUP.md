# Activer Nova collaboratif — Firebase Spark

Nova Tasks reste utilisable sans compte avec la clé locale historique `nova_tasks_v5`. Une fois connecté, le compte est global : objectifs personnels, notes, profil texte et réglages sont sauvegardés dans un seul document Firestore, tandis que les espaces communs restent séparés. Nova n’utilise ni Firebase Storage, ni Functions, ni Analytics, ni service payant.

## Lancer Nova sur cet ordinateur

La version recommandée est la version web hébergée : ouvre `https://itssoren.github.io/novaTasks/`. Elle active directement les comptes, la synchronisation personnelle et les espaces partagés, sans lancer de fichier local.

Un navigateur ne peut pas démarrer un serveur HTTP depuis un simple `file://` (c’est une restriction de sécurité). Dans ce mode, Nova reste donc utilisable hors ligne pour les données locales et affiche un lien vers la version web pour les fonctions cloud. Le petit lanceur local fourni dans le dossier est uniquement un secours de développement, pas une étape nécessaire pour les utilisateurs.

## Une seule fois dans Firebase

1. Ouvre ton projet `novatasks-23d9d` dans la console Firebase.
2. Dans **Authentication** → **Sign-in method**, active **E-mail/Mot de passe**.
3. Dans **Authentication** → **Settings** → **Authorized domains**, ajoute `itssoren.github.io` (et ton domaine personnalisé si tu en as un).
4. Dans **Firestore Database**, crée une base en région européenne et choisis le mode Production.
5. Ouvre l’onglet **Rules**, remplace tout par le contenu de `firestore.rules`, puis publie.
6. Déploie les fichiers de ce dossier sur GitHub Pages comme d’habitude.

`firebase-config.js` contient déjà les identifiants publics de l’application Web fournis par Firebase. Ne l’utilise pas pour y mettre une clé de service ou un secret : un site statique ne doit jamais contenir ce type de clé.

## Fonctionnement et quota Spark

- La liste d’espaces est récupérée depuis un seul index à la connexion ; Nova ne relit pas chaque espace et chaque rôle séparément, et elle n’a pas de listener permanent.
- Les données personnelles utilisent une lecture à la connexion puis une écriture différée après une modification enregistrée. Il n’y a aucune écriture à chaque frappe.
- Une fois un espace ouvert, Nova garde exactement deux listeners temps réel : ses tâches et ses notes. Changer d’espace ferme les deux précédents.
- L’historique est chargé uniquement lorsque l’onglet *Historique* est ouvert puis actualisé ; il est limité à 25 évènements.
- Les notes sont enregistrées par le bouton **Enregistrer**, jamais caractère par caractère.
- La photo de profil reste sur l’appareil. Les images partagées sont des liens `https://` externes. Aucun fichier ni base64 n’est envoyé dans Firestore.

Sur Spark, cela reste confortable pour de petits groupes. Évite surtout de laisser de très nombreux onglets ouverts sur un même espace et de multiplier les grosses notes ; chaque modification reçue par un listener correspond à une lecture.

## Les rôles, réellement appliqués

| Rôle | Tâches et notes | Membres et invitations |
| --- | --- | --- |
| Admin | lire, créer, modifier, supprimer | inviter, changer les rôles, retirer un membre |
| Membre | lire, créer, modifier, supprimer | lecture seulement |
| Spectateur | lecture seulement | lecture seulement |

Les règles Firestore imposent ces permissions côté serveur. Un bouton caché dans le navigateur ne peut donc pas donner de droits supplémentaires. Les liens sont des codes aléatoires de 12 caractères, consultables uniquement par une personne connectée, non listables et valables sept jours.

## Avant la publication

Teste avec deux adresses e-mail distinctes : crée un espace avec le premier compte, crée un lien d’invitation, rejoins-le avec le second, puis vérifie qu’un spectateur ne peut pas modifier une tâche. Ensuite, adapte si besoin l’URL de GitHub Pages dans `sitemap.xml`.
