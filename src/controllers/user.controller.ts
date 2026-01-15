// import { Request, Response } from 'express';
// import * as UserService from '../services/user.sevice';

// export async function getUserById(req: Request, res: Response) {
//     const { id } = req.params;
//     const mensaje = await UserService.getUserById(Number(id));
//     res.status(mensaje.code).json(mensaje);
// }

// export async function getUserByEmail(req: Request, res: Response) {
//     const { email } = req.params;
//     const mensaje = await UserService.getUserByEmail(email!);
//     res.status(mensaje.code).json(mensaje);
// }


// export async function updateUser(req: Request, res: Response) {
//     const {email, name, id} = req.body;
//     const mensaje = await UserService.updateUser(id,email!, name!);
//     res.status(mensaje.code).json(mensaje);
// }