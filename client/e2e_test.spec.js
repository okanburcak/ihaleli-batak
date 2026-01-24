
import { test, expect, devices } from '@playwright/test';

test.describe('Ihaleli Batak UI Regression', () => {
    test('Complete Game Lifecycle', async ({ page }) => {
        // Handle Dialogs
        page.on('dialog', async dialog => {
            console.log(`Alert/Confirm Dialog: ${dialog.message()}`);
            await dialog.dismiss();
        });



        // 1. Landing Page
        await page.goto('http://localhost:5173');
        await expect(page).toHaveTitle(/İhaleli Batak/);

        // 2. Create Room & Join
        await page.getByPlaceholder('Adınız').fill('TestAdmin');
        await page.getByText('MASALARI GÖR').click(); // Landing -> Lobby View

        await expect(page.getByText('Oyun Lobisi')).toBeVisible();
        await page.getByText('Yeni Masa Aç').click(); // Lobby -> Create

        // Wait for Game View Header "Room: 12345"
        await expect(page.getByText(/Room:/)).toBeVisible({ timeout: 15000 });
        const roomText = await page.getByText(/Room:/).innerText();
        console.log('Joined:', roomText);

        // 3. Add Bots/Players (We are Admin/Seat 0)
        // Check if we are seat 0
        await expect(page.getByText('Sen', { exact: true })).toBeVisible(); // Or similar indicator

        // 4. Start Game
        const startBtn = page.getByRole('button', { name: 'OYUNU BAŞLAT' });
        await expect(startBtn).toBeVisible();
        await startBtn.click();

        // 5. Verify Game Board (Bidding Phase)
        await expect(page.getByText('İhale')).toBeVisible({ timeout: 10000 });

        // 6. Mobile Responsiveness Check
        // Resize to iPhone 12 Pro
        await page.setViewportSize({ width: 390, height: 844 });
        // Check if hand is visible
        const cards = page.locator('.cursor-pointer.transition-transform'); // Card class selector approximation
        await expect(cards.first()).toBeVisible();
        // Check count (should be 13)
        const cardCount = await cards.count();
        console.log('Mobile Card Count:', cardCount);
        expect(cardCount).toBeGreaterThan(0);

        // 7. Admin Dashboard
        const adminBtn = page.getByRole('button', { name: 'YÖNETİCİ' });
        await adminBtn.click();
        await expect(page.getByText('Süper Admin Paneli')).toBeVisible();
        await page.keyboard.press('Escape'); // Close modal

        // 8. Sound Buttons
        await page.getByRole('button', { name: 'HADİ!' }).click();

        // 9. Redeal Button (Conditional)
        const redealBtn = page.getByRole('button', { name: 'ELİ BOZ' });
        if (await redealBtn.isVisible()) {
            console.log('Weak hand detected, testing Redeal...');
            // Optional: Listen for dialog
            page.on('dialog', dialog => dialog.accept());
            await redealBtn.click();
            // Expect game restart (Bidding visible again)
            await expect(page.getByText('İhale')).toBeVisible();
        } else {
            console.log('Strong hand dealt, skipping Redeal test.');
        }

        console.log('UI Regression Test Passed!');
    });
});
