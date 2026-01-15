import { MensajeApi } from '../types/MensajeApi';
import * as UserRepo from '../repositories/user.repo';

export async function getUserById(id: number): Promise<MensajeApi> {
    try{
        let mensaje: MensajeApi = new MensajeApi();
        // get user by id
        const user = await UserRepo.getUserById(id);
        if(!user) {
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
        let mensaje = new MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}

export async function getUserByEmail(email: string): Promise<MensajeApi> {
    try{
        let mensaje: MensajeApi = new MensajeApi();
        //get user by email
        const user = await UserRepo.getUserByEmail(email);
        if(!user) {
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
        let mensaje = new MensajeApi();
        mensaje.code = 500;
        mensaje.error = true;
        mensaje.message = 'Error al obtener el usuario';
        mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
        return mensaje;
    }
}

// export async function updateUser(id: number, email: string, name: string): Promise<MensajeApi> {
//     try{
//         let mensaje: MensajeApi = new MensajeApi();
//         //update user
//         const user = await UserRepo.getUserById(id);
//         if(!user) {
//             mensaje.code = 400;
//             mensaje.error = true;
//             mensaje.message = 'Usuario no encontrado';
//             return mensaje;
//         }
//         user.email = email;
//         user.name = name;
//         user.updatedAt = new Date();
//         await UserRepo.updateUser(id, user.email, user.name, user.updatedAt);
//         mensaje.code = 200;
//         mensaje.error = false;
//         mensaje.message = 'Usuario actualizado correctamente';
//         mensaje.data = user;
//         return mensaje;
//     } catch (error) {
//         let mensaje = new MensajeApi();
//         mensaje.code = 500;
//         mensaje.error = true;
//         mensaje.message = 'Error al actualizar el usuario';
//         mensaje.technicalMessage = error instanceof Error ? error.message : 'Error desconocido';
//         return mensaje;
//     }
// }