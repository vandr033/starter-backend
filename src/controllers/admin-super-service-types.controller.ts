import type { Response } from "express";
import { prisma } from "../prisma/client";
import { AuthenticatedRequest } from "../middlewares/requireAuth";

export const getServiceTypes = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const serviceTypes = await prisma.globalServiceType.findMany({
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        _count: {
          select: {
            categories: true as any,
            services: true as any,
          },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    const serviceTypesWithUsage = serviceTypes.map((type) => ({
      ...type,
      usageCount: (type as any)._count.categories + (type as any)._count.services,
    }));

    res.json(serviceTypesWithUsage);
  } catch (error) {
    console.error("Error fetching service types:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const createServiceType = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { key, name, description } = req.body;

    if (!key || !name) {
      return res.status(400).json({ error: "Key and name are required" });
    }

    const upperKey = key.toUpperCase();

    const existingType = await prisma.globalServiceType.findUnique({
      where: { key: upperKey },
    });

    if (existingType) {
      return res.status(409).json({ error: "Service type with this key already exists" });
    }

    const serviceType = await prisma.globalServiceType.create({
      data: {
        key: upperKey,
        name,
        description,
      },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
      },
    });

    res.status(201).json(serviceType);
  } catch (error) {
    console.error("Error creating service type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const updateServiceType = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const idNum = Array.isArray(id) ? parseInt(id[0]) : parseInt(id);
    const { key, name, description } = req.body;

    const serviceType = await prisma.globalServiceType.findUnique({
      where: { id: idNum },
    });

    if (!serviceType) {
      return res.status(404).json({ error: "Service type not found" });
    }

    if (key) {
      const upperKey = key.toUpperCase();
      const existingType = await prisma.globalServiceType.findFirst({
        where: {
          key: upperKey,
          id: { not: idNum },
        },
      });

      if (existingType) {
        return res.status(409).json({ error: "Service type with this key already exists" });
      }
    }

    const updatedServiceType = await prisma.globalServiceType.update({
      where: { id: idNum },
      data: {
        ...(key && { key: key.toUpperCase() }),
        ...(name && { name }),
        ...(description !== undefined && { description }),
      },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
      },
    });

    res.json(updatedServiceType);
  } catch (error) {
    console.error("Error updating service type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

export const deleteServiceType = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const idNum = Array.isArray(id) ? parseInt(id[0]) : parseInt(id);

    const serviceType = await prisma.globalServiceType.findUnique({
      where: { id: idNum },
      include: {
        _count: {
          select: {
            categories: true as any,
            services: true as any,
          },
        },
      },
    });

    if (!serviceType) {
      return res.status(404).json({ error: "Service type not found" });
    }

    const totalUsage = (serviceType as any)._count.categories + (serviceType as any)._count.services;

    if (totalUsage > 0) {
      return res.status(409).json({
        error: `Cannot delete: ${totalUsage} categor${totalUsage === 1 ? 'y' : 'ies'} are using this type`,
      });
    }

    await prisma.globalServiceType.delete({
      where: { id: idNum },
    });

    res.status(204).send();
  } catch (error) {
    console.error("Error deleting service type:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};
