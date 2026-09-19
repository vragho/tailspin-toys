import { and, asc, eq, inArray } from 'drizzle-orm';
import type { Database } from './db';
import { games, categories, publishers } from '../../db/schema';
import type { Category, Game, Publisher } from '../types/game';

export interface GameFilters {
    categoryIds?: number[];
    publisherId?: number;
}

const gameSelection = {
    id: games.id,
    title: games.title,
    description: games.description,
    starRating: games.starRating,
    categoryId: categories.id,
    categoryName: categories.name,
    categoryDescription: categories.description,
    publisherId: publishers.id,
    publisherName: publishers.name,
    publisherDescription: publishers.description,
};

type GameSelectionRow = {
    id: number;
    title: string;
    description: string;
    starRating: number | null;
    categoryId: number | null;
    categoryName: string | null;
    categoryDescription: string | null;
    publisherId: number | null;
    publisherName: string | null;
    publisherDescription: string | null;
};

function mapGame(row: GameSelectionRow): Game {
    return {
        id: row.id,
        title: row.title,
        description: row.description,
        starRating: row.starRating,
        category:
            row.categoryId !== null && row.categoryName !== null
                ? {
                      id: row.categoryId,
                      name: row.categoryName,
                      description: row.categoryDescription,
                  }
                : null,
        publisher:
            row.publisherId !== null && row.publisherName !== null
                ? {
                      id: row.publisherId,
                      name: row.publisherName,
                      description: row.publisherDescription,
                  }
                : null,
    };
}

function baseGamesQuery(db: Database) {
    return db
        .select(gameSelection)
        .from(games)
        .leftJoin(categories, eq(games.categoryId, categories.id))
        .leftJoin(publishers, eq(games.publisherId, publishers.id));
}

/**
 * Return games matching the selected category and publisher filters.
 *
 * @param db The database instance used for the lookup.
 * @param filters Optional category and publisher constraints.
 * @returns Matching games sorted alphabetically by title.
 */
export async function getFilteredGames(
    db: Database,
    filters: GameFilters = {},
): Promise<Game[]> {
    const conditions = [];

    if (filters.categoryIds && filters.categoryIds.length > 0) {
        conditions.push(inArray(games.categoryId, filters.categoryIds));
    }

    if (filters.publisherId !== undefined) {
        conditions.push(eq(games.publisherId, filters.publisherId));
    }

    const query = baseGamesQuery(db);
    const rows = await (conditions.length > 0
        ? query.where(and(...conditions)).orderBy(asc(games.title))
        : query.orderBy(asc(games.title)));
    return rows.map(mapGame);
}

/**
 * Return all games ordered by title.
 *
 * @param db The database instance used for the lookup.
 * @returns Every game sorted alphabetically by title.
 */
export async function getAllGames(db: Database): Promise<Game[]> {
    return getFilteredGames(db);
}

/**
 * Return all categories ordered by name for filter controls.
 *
 * @param db The database instance used for the lookup.
 * @returns Categories sorted alphabetically by name.
 */
export async function getAllCategories(db: Database): Promise<Category[]> {
    const rows = await db
        .select({ id: categories.id, name: categories.name, description: categories.description })
        .from(categories)
        .orderBy(asc(categories.name));
    return rows;
}

/**
 * Return all publishers ordered by name for filter controls.
 *
 * @param db The database instance used for the lookup.
 * @returns Publishers sorted alphabetically by name.
 */
export async function getAllPublishers(db: Database): Promise<Publisher[]> {
    const rows = await db
        .select({ id: publishers.id, name: publishers.name, description: publishers.description })
        .from(publishers)
        .orderBy(asc(publishers.name));
    return rows;
}

/**
 * Return all game ids ordered by title.
 *
 * @param db The database instance used for the lookup.
 * @returns Game ids sorted alphabetically by their title.
 */
export async function getAllGameIds(db: Database): Promise<number[]> {
    const rows = await db.select({ id: games.id }).from(games).orderBy(asc(games.title));
    return rows.map((row) => row.id);
}

/**
 * Return a single game by id, or null when it does not exist.
 *
 * @param db The database instance used for the lookup.
 * @param id The game id to find.
 * @returns The matching game, or null when no game has that id.
 */
export async function getGameById(db: Database, id: number): Promise<Game | null> {
    const row = await baseGamesQuery(db).where(eq(games.id, id)).get();
    return row ? mapGame(row) : null;
}
