import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDatabase } from '../../db/test-helpers';
import { categories, publishers, games } from '../../db/schema';
import type { Database } from './db';
import {
    getAllGames,
    getAllCategories,
    getAllGameIds,
    getAllPublishers,
    getFilteredGames,
    getGameById,
} from './games';

async function seedGames(db: Database, count: number): Promise<void> {
    const [category] = await db
        .insert(categories)
        .values({ name: 'Strategy', description: 'cat' })
        .returning({ id: categories.id });
    const [publisher] = await db
        .insert(publishers)
        .values({ name: 'Pub One', description: 'pub' })
        .returning({ id: publishers.id });

    // Insert titles in reverse-alphabetical order to prove ordering is applied.
    for (let i = count; i >= 1; i--) {
        await db.insert(games).values({
            title: `Game ${String(i).padStart(2, '0')}`,
            description: `Description ${i}`,
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });
    }
}

describe('games data-access helpers', () => {
    let db: Database;

    beforeEach(async () => {
        db = await createTestDatabase();
    });

    it('returns all games ordered by title with descriptions for related records', async () => {
        await seedGames(db, 3);
        const all = await getAllGames(db);
        expect(all.map((g) => g.title)).toEqual(['Game 01', 'Game 02', 'Game 03']);
        expect(all[0].category).toEqual({
            id: expect.any(Number),
            name: 'Strategy',
            description: 'cat',
        });
        expect(all[0].publisher).toEqual({
            id: expect.any(Number),
            name: 'Pub One',
            description: 'pub',
        });
    });

    it('returns all game ids ordered by title', async () => {
        await seedGames(db, 3);
        const ids = await getAllGameIds(db);
        const all = await getAllGames(db);
        expect(ids).toEqual(all.map((g) => g.id));
    });

    it('fetches a single game by id', async () => {
        await seedGames(db, 2);
        const ids = await getAllGameIds(db);
        const game = await getGameById(db, ids[0]);
        expect(game?.title).toBe('Game 01');
    });

    it('returns null for a non-existent game', async () => {
        await seedGames(db, 2);
        expect(await getGameById(db, 99999)).toBeNull();
    });

    it('filters games by one or more categories and a publisher', async () => {
        const [strategy] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: 'strategy' })
            .returning({ id: categories.id });
        const [puzzle] = await db
            .insert(categories)
            .values({ name: 'Puzzle', description: 'puzzle' })
            .returning({ id: categories.id });
        const [codeForge] = await db
            .insert(publishers)
            .values({ name: 'CodeForge Studios', description: 'publisher' })
            .returning({ id: publishers.id });
        const [devMasters] = await db
            .insert(publishers)
            .values({ name: 'DevMasters Inc.', description: 'publisher' })
            .returning({ id: publishers.id });

        await db.insert(games).values([
            {
                title: 'Strategy Forge',
                description: 'A strategy game',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: codeForge.id,
            },
            {
                title: 'Puzzle Forge',
                description: 'A puzzle game',
                starRating: 4,
                categoryId: puzzle.id,
                publisherId: codeForge.id,
            },
            {
                title: 'Strategy Masters',
                description: 'Another strategy game',
                starRating: 4,
                categoryId: strategy.id,
                publisherId: devMasters.id,
            },
        ]);

        const filtered = await getFilteredGames(db, {
            categoryIds: [strategy.id, puzzle.id],
            publisherId: codeForge.id,
        });

        expect(filtered.map((game) => game.title)).toEqual([
            'Puzzle Forge',
            'Strategy Forge',
        ]);
    });

    it('returns an empty list when filters match no games', async () => {
        await seedGames(db, 1);
        const categoriesList = await getAllCategories(db);
        expect(
            await getFilteredGames(db, { categoryIds: [categoriesList[0].id], publisherId: 99999 }),
        ).toEqual([]);
    });

    it('returns filter options ordered by name with their descriptions', async () => {
        await seedGames(db, 1);
        expect(await getAllCategories(db)).toEqual([
            { id: expect.any(Number), name: 'Strategy', description: 'cat' },
        ]);
        expect(await getAllPublishers(db)).toEqual([
            { id: expect.any(Number), name: 'Pub One', description: 'pub' },
        ]);
    });

    it('handles missing descriptions gracefully', async () => {
        const [category] = await db
            .insert(categories)
            .values({ name: 'Strategy', description: null })
            .returning({ id: categories.id });
        const [publisher] = await db
            .insert(publishers)
            .values({ name: 'Pub One', description: null })
            .returning({ id: publishers.id });

        await db.insert(games).values({
            title: 'Game 01',
            description: 'Description 1',
            starRating: 4.2,
            categoryId: category.id,
            publisherId: publisher.id,
        });

        const game = await getGameById(db, 1);
        expect(game?.category).toEqual({ id: category.id, name: 'Strategy', description: null });
        expect(game?.publisher).toEqual({ id: publisher.id, name: 'Pub One', description: null });
    });
});
