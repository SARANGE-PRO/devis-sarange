// Point d'entrée `node --import ./tests/helpers/register-alias.mjs <test>` :
// enregistre le chargeur qui rend les modules de l'application (alias « @/ »,
// imports sans extension, JSON) exécutables par le runner Node, sans bundler.
import { register } from 'node:module';

register('./next-alias-loader.mjs', import.meta.url);
