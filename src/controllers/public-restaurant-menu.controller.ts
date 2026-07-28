import type { Response } from 'express';
import * as Menu from '../services/public-restaurant-menu.service';
export async function menu(req: any, res: Response) { const result = await Menu.getPublicRestaurantMenu(String(req.params.slug || '')); return res.status(result.code).json(result); }
