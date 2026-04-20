import { MensajeApi } from '../types/MensajeApi';
import * as UserRepo from '../repositories/user.repo';

export async function getUserById(id: string): Promise<MensajeApi> {
    try {
        const mensaje = new MensajeApi();
        const user = await UserRepo.getUserById(id);

        if (!user) {
            mensaje.code = 400;
            mensaje.error = true;
            mensaje.message = 'Usuario no encontrado';
            return mensaje;
        }

        mensaje.code = 200;
        mensaje.error = false;
        mensaje.message = 'Usuario encontrado';
        mensaje.data = user;
        return mensaje;
    } catch (error) {
        const mensaje = new MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}

export async function getUserByEmail(email: string): Promise<MensajeApi> {
    try {
        const mensaje = new MensajeApi();
        const user = await UserRepo.getUserByEmail(email);

        if (!user) {
            mensaje.code = 400;
            mensaje.error = true;
            mensaje.message = 'Usuario no encontrado';
            return mensaje;
        }

        mensaje.code = 200;
        mensaje.error = false;
        mensaje.message = 'Usuario encontrado';
        mensaje.data = user;
        return mensaje;
    } catch (error) {
        const mensaje = new MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}
