import type { Request, Response } from 'express';
import * as UserService from '../services/user.service';

export async function getUserById(req: Request, res: Response) {
    const id = typeof req.params.id === 'string' ? req.params.id : '';
    if (!id) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid id' });
    }

    const mensaje = await UserService.getUserById(id);
    return res.status(mensaje.code).json(mensaje);
}

export async function getUserByEmail(req: Request, res: Response) {
    const email = typeof req.params.email === 'string' ? req.params.email : '';
    if (!email) {
        return res.status(400).json({ code: 400, error: true, message: 'Invalid email' });
    }

    const mensaje = await UserService.getUserByEmail(email);
    return res.status(mensaje.code).json(mensaje);
}

export async function updateUser(_req: Request, res: Response) {
    return res.status(501).json({
        code: 501,
        error: true,
        message: 'Not implemented',
    });
}
