
# Brigade 1959 V2

Application V2 pour les approvisionnements de la Guinguette.

## Ce que contient cette version

- Tableau de bord "Aujourd'hui"
- Rappels
- Inventaire
- Vue "Tous les produits"
- Vue par fournisseur
- Coche produit vérifié
- Stock actuel
- Semaine dernière
- Suggestion
- À commander
- Notes
- Statuts fournisseur séparés :
  - Commande préparée
  - Commande passée
- Sauvegarde Supabase

## Installation locale

```bash
npm install
npm run dev
```

## Déploiement Vercel

Vercel détectera automatiquement Vite.

## Supabase

Avant la première utilisation, lancer le fichier :

`supabase_v2_schema.sql`

dans Supabase > SQL Editor.



## V3
- Tableau de bord avec progression d'inventaire.
- Moyenne des 4 dernières semaines par produit.
- Statut fournisseur détaillé : préparée / passée / heure / mode.
- Demande du mode de passage quand la commande est marquée comme passée.


## V3.1
- Sélecteur de semaine : précédente / actuelle / suivante.
- Explication logique : chaque lundi crée une nouvelle période automatiquement.
- Bouton "Réinitialiser commande" par fournisseur.
- Filtrage des fausses lignes produits côté application.
- Script SQL `supabase_v3_1_cleanup_products.sql` pour nettoyer les titres importés par erreur.
