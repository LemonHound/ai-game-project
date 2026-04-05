import { describe, expect, it } from 'vitest';
import pkg from '../../../package.json';

describe('Project configuration', () => {
    it('package.json has correct name', () => {
        expect(pkg.name).toBe('aigamewebsite');
    });

    it('package.json declares required scripts', () => {
        expect(pkg.scripts).toHaveProperty('dev');
        expect(pkg.scripts).toHaveProperty('build');
        expect(pkg.scripts).toHaveProperty('test:unit');
        expect(pkg.scripts).toHaveProperty('test:e2e');
    });

    it('package.json declares React and TanStack Query', () => {
        expect(pkg.dependencies).toHaveProperty('react');
        expect(pkg.dependencies).toHaveProperty('@tanstack/react-query');
        expect(pkg.dependencies).toHaveProperty('zustand');
    });
});
